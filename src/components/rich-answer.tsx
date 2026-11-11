import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";

import { prepareAnswerMarkdown } from "@/lib/agent/format";
import type { AgentSource } from "@/lib/agent/types";

const ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "br",
  "blockquote",
  "code",
  "pre",
  "h3",
  "h4",
  "a",
];

export function RichAnswer({
  answer,
  sources,
  className,
}: {
  answer: string;
  sources?: AgentSource[];
  className?: string;
}) {
  const markdown = prepareAnswerMarkdown(
    answer,
    sources?.map((source) => source.rank),
  );

  return (
    <div className={["rich-answer", className].filter(Boolean).join(" ")}>
      <Markdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        remarkPlugins={[remarkBreaks]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("#agent-source-")) {
              const rank = href.slice("#agent-source-".length);
              return (
                <a
                  className="agent-citation"
                  href={href}
                  aria-label={`Ir a la fuente ${rank}`}
                >
                  {children}
                </a>
              );
            }
            return <span>{children}</span>;
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
