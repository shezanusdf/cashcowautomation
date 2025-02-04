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

interface GenerateFormData {
  script: string;
  category: string | string[];
  totalLength: number;
  clipDuration: number;
  useHook: boolean;
}

interface VideoStatusResponse {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  outputUrl?: string;
}

export default function GeneratePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [generatedVideoId, setGeneratedVideoId] = useState<number | null>(null);
  const { toast } = useToast();
  const { register, handleSubmit } = useForm<GenerateFormData>();

  const { data: videoStatus } = useQuery<VideoStatusResponse>({
    queryKey: ["video-status", generatedVideoId],
    queryFn: async () => {
      if (!generatedVideoId) return null;
      const response = await fetch(`/api/videos/status/${generatedVideoId}`);
      if (!response.ok) throw new Error("Failed to fetch status");
      const data = await response.json();
      console.log("Status update:", data); // Debug log
      return data;
    },
    enabled: !!generatedVideoId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    staleTime: 0
  });

  const generateMutation = useMutation({
    mutationFn: async (data: GenerateFormData) => {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to generate video");
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedVideoId(data.id);
      toast({
        title: "Video generation started",
        description: "Your video will be ready soon!",
      });
    }
  });

  const onSubmit = (data: GenerateFormData) => {
    if (selectedCategories.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one video category",
        variant: "destructive",
      });
      return;
    }
    if (data.totalLength <= data.clipDuration) {
      toast({
        title: "Error",
        description: "Total video length must be greater than clip duration",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate({ ...data, category: selectedCategories });
  };

  // Show progress immediately after form submission
  const showProgress = generateMutation.isPending || (videoStatus && ["pending", "processing"].includes(videoStatus.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-4">What footage do you want to use?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {VIDEO_CATEGORIES.filter(category => category.id !== 'hooks').map((category) => (
              <div
                key={category.id}
                onClick={() => {
                  if (selectedCategories.includes(category.id)) {
                    setSelectedCategories(selectedCategories.filter(id => id !== category.id));
                  } else {
                    setSelectedCategories([...selectedCategories, category.id]);
                  }
                }}
              >
                <VideoCategory
                  id={category}
                  label={category.title}
                  description={category.title}
                  selected={selectedCategories.includes(category.id)}
                />
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="totalLength">Set Total Video Length (in seconds):</Label>
            <input
              type="number"
              id="totalLength"
              placeholder="60"
              {...register("totalLength", { required: true, valueAsNumber: true })}
              className="border rounded p-2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clipDuration">Set Clip Duration (in seconds):</Label>
            <input
              type="number"
              id="clipDuration"
              placeholder="5"
              {...register("clipDuration", { required: true, valueAsNumber: true })}
              className="border rounded p-2"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch {...register("useHook")} id="useHook" />
            <Label htmlFor="useHook">Add a random hook to the video</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="script">Script for voiceover</Label>
            <Textarea
              id="script"
              {...register("script", { required: true })}
              placeholder="Enter your script for the AI voiceover..."
              className="h-32"
            />
          </div>

          {/* Progress Bar */}
          {showProgress && (
            <div className="p-4 border rounded-lg bg-white shadow-sm space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  {videoStatus?.status === "processing" ? "Generating video..." : "Preparing..."}
                </span>
                <span>{Math.round(videoStatus?.progress || 0)}%</span>
              </div>
              <Progress 
                value={videoStatus?.progress || 0} 
                className="h-2 bg-gray-100" 
              />
            </div>
          )}

          {/* Video Player and Download Button */}
          {videoStatus?.status === "completed" && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border bg-black">
                <video
                  src={videoStatus.outputUrl!}
                  controls
                  className="w-full aspect-video"
                  playsInline
                />
              </div>
              <Button
                variant="default"
                size="lg"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  const iframe = document.createElement('iframe');
                  iframe.style.display = 'none';
                  iframe.src = videoStatus.outputUrl! + "?download=true";
                  document.body.appendChild(iframe);
                  setTimeout(() => document.body.removeChild(iframe), 1000);
                }}
              >
                <Download className="h-5 w-5" />
                Download Video
              </Button>
            </div>
          )}

          {videoStatus?.status === "failed" && (
            <div className="text-red-500 mt-4">
            Error: {videoStatus.error || "Failed to generate video"}
            </div>
          )}

          <Button
            type="submit"
            disabled={generateMutation.isPending || ["processing", "pending"].includes(videoStatus?.status || "")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {generateMutation.isPending ? "Starting..." : "Generate Video"}
          </Button>
        </form>
      </div>
    </div>
  );
}