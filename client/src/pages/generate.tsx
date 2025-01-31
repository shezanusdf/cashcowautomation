import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { VideoCategory } from "@/components/video-category";
import { VIDEO_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Download } from "lucide-react";
import type { VideoCategory as VideoCategoryType, GeneratedVideo } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";

interface GenerateFormData {
  script: string;
  category: VideoCategoryType;
  useHook: boolean;
}

export default function GeneratePage() {
  const [selectedCategory, setSelectedCategory] = useState<VideoCategoryType | null>(null);
  const [generatedVideoId, setGeneratedVideoId] = useState<number | null>(null);
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<GenerateFormData>({
    defaultValues: {
      script: "",
      useHook: false
    }
  });

  // Query to check video generation status
  const { data: generatedVideo } = useQuery<GeneratedVideo>({
    queryKey: ["/api/videos/status", generatedVideoId],
    enabled: !!generatedVideoId,
    refetchInterval: (data) => 
      data?.status === "completed" || data?.status === "failed" ? false : 2000,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: GenerateFormData) => {
      const response = await apiRequest("POST", "/api/videos/generate", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedVideoId(data.id);
      toast({
        title: "Video generation started",
        description: "Your video will be ready soon!"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: GenerateFormData) => {
    if (!selectedCategory) {
      toast({
        title: "Error",
        description: "Please select a video category",
        variant: "destructive"
      });
      return;
    }

    generateMutation.mutate({
      ...data,
      category: selectedCategory
    });
  };

  const getStatusText = () => {
    if (!generatedVideo) return "";
    switch (generatedVideo.status) {
      case "pending":
        return "Preparing to generate...";
      case "processing":
        return "Generating video...";
      case "completed":
        return "Video ready!";
      case "failed":
        return "Generation failed";
      default:
        return "";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-4">What footage do you want to use?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {VIDEO_CATEGORIES.map((category) => (
              <VideoCategory
                key={category.id}
                {...category}
                selected={selectedCategory === category.id}
                onClick={() => setSelectedCategory(category.id)}
              />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center space-x-2">
            <Switch id="hook" {...register("useHook")} />
            <Label htmlFor="hook">Add a random hook to the video</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="script">Script for voiceover</Label>
            <Textarea
              id="script"
              placeholder="Enter your script for the AI voiceover..."
              {...register("script", { required: "Script is required" })}
              className="h-32"
            />
            {errors.script && (
              <p className="text-sm text-red-500">{errors.script.message}</p>
            )}
          </div>

          {generatedVideo && generatedVideo.status !== "completed" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{getStatusText()}</span>
                <span>{generatedVideo.progress || 0}%</span>
              </div>
              <Progress value={generatedVideo.progress || 0} className="w-full" />
            </div>
          )}

          {generatedVideo?.status === "completed" && generatedVideo.outputUrl && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(generatedVideo.outputUrl, '_blank')}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Generated Video
            </Button>
          )}

          <Button
            type="submit"
            disabled={generateMutation.isPending || (generatedVideo && generatedVideo.status === "processing")}
            className="w-full"
          >
            {generateMutation.isPending ? "Generating..." : "Generate Video"}
          </Button>
        </form>
      </div>
    </div>
  );
}