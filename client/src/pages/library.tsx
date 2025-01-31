import { useQuery } from "@tanstack/react-query";
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
import { useState, useRef } from "react";
import { Progress } from "@/components/ui/progress"; // Assuming Progress component is available

export default function LibraryPage() {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // Added upload progress state
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: clips, refetch } = useQuery<VideoClip[]>({
    queryKey: ["/api/clips"],
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
    if (!file.type.startsWith("video/")) {
      toast({
        title: "Error",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 100MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      const xhr = new XMLHttpRequest();
      let progressPercent = 0;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          progressPercent = Math.round((event.loaded * 100) / event.total);
          setUploadProgress(progressPercent);
        }
      });

      const response = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(xhr.responseText));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('POST', '/api/clips/upload');
        xhr.send(formData);
      });

      refetch();
      toast({
        title: "Success",
        description: "Clip uploaded successfully",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload clip",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (category: string, e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleUpload(category, file);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Tabs defaultValue="motivation">
        <TabsList className="mb-8">
          {VIDEO_CATEGORIES.map((category) => (
            <TabsTrigger key={category.id} value={category.id}>
              {category.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="hooks">Random Hooks</TabsTrigger>
        </TabsList>

        {[...VIDEO_CATEGORIES, { id: "hooks", label: "Random Hooks" }].map(
          (category) => (
            <TabsContent key={category.id} value={category.id}>
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Upload New Clip</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? "border-primary bg-primary/5"
                          : "border-gray-300 hover:border-primary/50"
                      } ${isUploading ? "opacity-50" : ""}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(category.id, e)}
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                    >
                      {isUploading ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Uploading...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <Progress value={uploadProgress} className="w-full" />
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto mb-4 text-gray-400" />
                          <p className="text-sm text-gray-500 mb-2">
                            Drag and drop your video here, or click to select
                          </p>
                          <p className="text-xs text-gray-400">
                            Supports: MP4, MOV, AVI (max 100MB)
                          </p>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(category.id, file);
                        }}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clips
                    ?.filter((clip) => clip.category === category.id)
                    .map((clip) => (
                      <Card key={clip.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <Label className="font-medium">{clip.name}</Label>
                              <p className="text-sm text-gray-500">
                                Duration: {clip.duration}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(clip.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <video
                            src={clip.url}
                            controls
                            className="w-full rounded-lg"
                          />
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            </TabsContent>
          )
        )}
      </Tabs>
    </div>
  );
}