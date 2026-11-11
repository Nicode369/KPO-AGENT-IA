import { startDemo } from "@/app/auth/actions";

const DEMOS = [
  { value: "kpo", label: "DEMO KPO", tone: "button-primary" },
  { value: "clima", label: "DEMO CLIMA", tone: "button-secondary" },
] as const;

export function DemoButtons({
  variant = "inline",
  className,
}: {
  variant?: "inline" | "auth";
  className?: string;
}) {
  return (
    <div
      className={[
        "demo-actions",
        variant === "auth" ? "demo-actions-auth" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {DEMOS.map((demo) => (
        <form className="demo-form" action={startDemo} key={demo.value}>
          <input type="hidden" name="demo" value={demo.value} />
          <button className={`button ${demo.tone}`} type="submit">
            {demo.label}
          </button>
        </form>
      ))}
    </div>
  );
}
