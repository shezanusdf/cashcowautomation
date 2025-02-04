import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function NavigationBar() {
  const [location] = useLocation();

  return (
    <nav className="border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Video Generator
              </h1>
            </div>
            <div className="ml-6 flex space-x-8">
              <Link href="/">
                <Button variant="ghost" className="w-full justify-start">
                  <span className="flex items-center">
                    Generate
                  </span>
                </Button>
              </Link>
              <Link href="/library">
                <Button variant="ghost" className="w-full justify-start">
                  <span className="flex items-center">
                    Library
                  </span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
