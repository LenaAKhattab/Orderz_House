import { structureContent } from "../../lib/publicContent/structureContent";
import "./rich-content.css";

/**
 * Readable rendering of admin-authored plain text (headings, lists, paragraphs, meta line).
 * @param {{ text: string, headingLevel?: 2 | 3, className?: string }} props
 */
export default function RichContent({ text, headingLevel = 2, className = "" }) {
  const nodes = structureContent(text);
  if (!nodes.length) return null;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={`rich-content ${className}`.trim()}>
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;
        if (node.type === "heading") return <Heading key={key} className="rich-content__heading">{node.text}</Heading>;
        if (node.type === "meta") return <p key={key} className="rich-content__meta">{node.text}</p>;
        if (node.type === "ul") {
          return (
            <ul key={key} className="rich-content__list">
              {node.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }
        if (node.type === "ol") {
          return (
            <ol key={key} className="rich-content__list rich-content__list--ordered" start={node.start || 1}>
              {node.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          );
        }
        return <p key={key}>{node.text}</p>;
      })}
    </div>
  );
}
