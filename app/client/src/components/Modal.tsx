import { type ReactNode, useCallback } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  hideClose?: boolean;
  className?: string;
}

export function Modal({ title, open, onClose, children, hideClose = false, className }: ModalProps) {
  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) onClose();
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn('h-[82vh] max-h-[82vh] overflow-hidden bg-popover/95 backdrop-blur-md', className)}>
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">{title}</DialogTitle>
          {!hideClose && (
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          )}
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
