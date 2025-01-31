import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VIDEO_CATEGORIES } from "@/lib/constants";
import type { VideoClip } from "@/lib/types";
import { Upload, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function LibraryPage() {
  const { toast } = useToast();
  
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
        description: "Clip deleted successfully"
      });
    }
  });

  const handleFileUpload = async (category: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      await apiRequest("POST", "/api/clips/upload", formData);
      refetch();
      toast({
        title: "Success",
        description: "Clip uploaded successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload clip",
        variant: "destructive"
      });
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

        {[...VIDEO_CATEGORIES, { id: 'hooks', label: 'Random Hooks' }].map((category) => (
          <TabsContent key={category.id} value={category.id}>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload New Clip</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept="video/*"
                      onChange={(e) => handleFileUpload(category.id, e)}
                      className="flex-1"
                    />
                    <Button>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
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
        ))}
      </Tabs>
    </div>
  );
}
