import { useState } from "react";
import { Button } from "./ui/button";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadClipProps {
  category: string;
  onSuccess?: () => void;
}

export function UploadClip({ category, onSuccess }: UploadClipProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);

    try {
      const response = await fetch('/api/clips/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast({
        title: "Success",
        description: "Clip uploaded successfully",
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload clip",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset the input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
      <label className="cursor-pointer flex flex-col items-center gap-2">
        <input
          type="file"
          accept="video/*"
          onChange={handleUpload}
          disabled={isUploading}
          className="hidden"
        />
        <Upload className="h-8 w-8 text-gray-400" />
        <span className="text-sm text-gray-600">
          {isUploading ? "Uploading..." : "Click to upload video"}
        </span>
        <span className="text-xs text-gray-400">
          Supports: MP4, WebM, MOV
        </span>
      </label>
    </div>
  );
} 