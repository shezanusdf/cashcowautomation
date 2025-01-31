import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

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
                <a
                  className={cn(
                    "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                    location === "/"
                      ? "border-blue-500 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  Generate
                </a>
              </Link>
              <Link href="/library">
                <a
                  className={cn(
                    "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                    location === "/library"
                      ? "border-blue-500 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  Library
                </a>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
