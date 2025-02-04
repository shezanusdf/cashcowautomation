import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VIDEO_CATEGORIES } from "@/lib/constants";
import type { VideoClip } from "@/lib/types";
import { Upload, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { UploadClip } from "@/components/upload-clip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LibraryPage() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("motivation");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [clipToDelete, setClipToDelete] = useState<VideoClip | null>(null);

  const { data: clips, refetch } = useQuery<VideoClip[]>({
    queryKey: ["clips"],
    queryFn: async () => {
      const response = await fetch("/api/clips");
      if (!response.ok) throw new Error("Failed to fetch clips");
      const data = await response.json();
      console.log("Loaded clips:", {
        total: data.length,
        byCategory: data.reduce((acc: Record<string, number>, clip: VideoClip) => {
          acc[clip.category] = (acc[clip.category] || 0) + 1;
          return acc;
        }, {}),
        clips: data
      });
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clips/${id}`);
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Success",
        description: "Clip deleted successfully",
      });
    },
  });

  const handleUpload = async (category: string, file: File) => {
    console.log("Uploading file:", {
      name: file.name,
      category,
      type: file.type,
      size: file.size
    });

    if (!file.type.startsWith("video/")) {
      toast({ title: "Error", description: "Please upload a video file", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded * 100) / event.total));
        }
      });

      const response = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => reject();
        xhr.open('POST', '/api/clips/upload');
        xhr.send(formData);
      });

      console.log('Upload successful:', response);
      await refetch();
      setActiveCategory(category);
      toast({ title: "Success", description: "Clip uploaded successfully" });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Error", description: "Failed to upload clip", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUploadSuccess = () => {
    // Refetch clips after successful upload
    queryClient.invalidateQueries({ queryKey: ["clips"] });
  };

  const handleDelete = async (clip: VideoClip) => {
    try {
      const response = await fetch(`/api/clips/${clip.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete clip');
      }

      toast({
        title: "Success",
        description: "Clip deleted successfully",
      });
      
      queryClient.invalidateQueries({ queryKey: ["clips"] });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete clip",
        variant: "destructive",
      });
    }
  };

  const filteredClips = clips?.filter(clip => clip.category === activeCategory) || [];

  useEffect(() => {
    if (clips?.length) {
      console.log('All clips:', clips);
      console.log('Filtered clips for', activeCategory, ':', filteredClips);
    }
  }, [clips, activeCategory, filteredClips]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">Video Library</h1>
      
      <Tabs defaultValue={VIDEO_CATEGORIES[0].id} className="space-y-6">
        <div className="relative">
          <TabsList className="flex overflow-x-auto no-scrollbar bg-transparent pb-2">
            {VIDEO_CATEGORIES.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="
                  flex-shrink-0
                  px-6 py-2 mx-1
                  rounded-lg 
                  text-gray-800 font-medium
                  bg-gray-100 hover:bg-gray-200
                  data-[state=active]:bg-blue-600 
                  data-[state=active]:text-white
                  transition-colors
                  whitespace-nowrap
                "
              >
                {category.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {VIDEO_CATEGORIES.map((category) => (
          <TabsContent key={category.id} value={category.id}>
            <div className="space-y-6">
              <UploadClip 
                category={category.id} 
                onSuccess={handleUploadSuccess}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clips?.filter(clip => clip.category === category.id).map((clip) => (
                  <Card key={clip.id} className="overflow-hidden bg-white shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="p-4 bg-gray-50 border-b flex flex-row justify-between items-center">
                      <CardTitle className="text-lg font-medium truncate">
                        {clip.name}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-500 hover:text-red-600"
                        onClick={() => setClipToDelete(clip)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="aspect-video bg-black">
                        <video
                          src={clip.url}
                          controls
                          className="w-full h-full object-contain"
                          playsInline
                        />
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-gray-600">
                          Duration: {clip.duration}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {clips?.filter(clip => clip.category === category.id).length === 0 && (
                  <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-lg">
                      No videos in this category yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog open={!!clipToDelete} onOpenChange={() => setClipToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the clip. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (clipToDelete) {
                  handleDelete(clipToDelete);
                  setClipToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}