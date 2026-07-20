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
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
    >
      <PhoneIcon className="h-4.5 w-4.5" />
      Continue with phone
    </button>
  );
}
