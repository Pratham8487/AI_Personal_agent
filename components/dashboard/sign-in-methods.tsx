import { GitHubIcon, GoogleIcon, MailIcon } from "@/components/landing/icons";

/**
 * `users.providers` is an array — an account reached by both Google and a
 * password shows both, so render every linked method rather than the first.
 */
const METHODS = {
  google: { label: "Google", Icon: GoogleIcon },
  github: { label: "GitHub", Icon: GitHubIcon },
  email: { label: "Email", Icon: MailIcon },
} as const;

const ORDER = ["google", "github", "email"] as const;

export default function SignInMethods({ providers }: { providers?: string[] }) {
  const linked = ORDER.filter((key) => providers?.includes(key));
  // Every sign-up path writes at least one known provider, so this only
  // catches unrecognised values — extend METHODS when adding a provider.
  const shown = linked.length > 0 ? linked : (["email"] as const);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">Signed in with</span>
      {shown.map((key) => {
        const { label, Icon } = METHODS[key];
        return (
          <span
            key={key}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </span>
        );
      })}
    </div>
  );
}
