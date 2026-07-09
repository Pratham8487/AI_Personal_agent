import { PhoneIcon } from "@/components/landing/icons";

export default function PhoneButton({
  onClick,
  pending,
}: {
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <PhoneIcon className="h-4.5 w-4.5" />
      Continue with phone
    </button>
  );
}
