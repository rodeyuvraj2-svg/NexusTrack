import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/lib/guest";

export function GuestRestrictionModal() {
  const { restrictedAction, setRestrictedAction } = useGuest();
  const navigate = useNavigate();
  const open = restrictedAction !== null;

  function onClose() {
    setRestrictedAction(null);
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Create an account to continue</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed">
            Save your progress, build your library, connect with friends, and sync everything
            across devices.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => {
              onClose();
              navigate({ to: "/auth" });
            }}
          >
            Create Account
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full text-base"
            onClick={() => {
              onClose();
              navigate({ to: "/auth" });
            }}
          >
            Login
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full text-base text-muted-foreground"
            onClick={onClose}
          >
            Continue Browsing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
