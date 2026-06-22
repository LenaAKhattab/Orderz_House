import { splitTextWithLinks } from "../../utils/linkifyText";
import "./linkifiedText.css";

export default function LinkifiedText({ text, className = "", linkClassName = "" }) {
  const value = String(text ?? "").trim();
  if (!value) return null;

  const segments = splitTextWithLinks(value);
  const linkClass = ["oh-linkified-text__link", linkClassName].filter(Boolean).join(" ");

  return (
    <span className={["oh-linkified-text", className].filter(Boolean).join(" ")}>
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            className={linkClass}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
          >
            {segment.value}
          </a>
        ) : (
          <span key={`text-${index}`}>{segment.value}</span>
        ),
      )}
    </span>
  );
}
