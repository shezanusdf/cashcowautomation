import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VideoCategory } from "@/lib/types";

interface VideoCategoryProps {
  id: { id: string; title: string };
  label: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
}

export function VideoCategory({
  label,
  description,
  selected,
  onClick,
}: VideoCategoryProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:scale-105",
        selected && "ring-2 ring-blue-500"
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <h3 className="font-semibold text-lg mb-2">{label}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  );
}
