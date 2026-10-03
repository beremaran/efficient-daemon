import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** An icon-only ghost button. `label` is its accessible name and its tooltip, shown on hover and focus. */
function IconButton({
  label,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label" | "size" | "variant"> & { label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} {...props} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { IconButton };
