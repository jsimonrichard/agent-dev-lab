import { Skeleton } from "@/components/ui/skeleton";

export function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading conversation">
      <div className="flex justify-end">
        <Skeleton className="h-12 w-[70%] rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-24 w-[85%] rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-16 w-[60%] rounded-2xl" />
      </div>
    </div>
  );
}
