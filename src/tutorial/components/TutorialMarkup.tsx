import { Fragment, type ReactNode } from 'react';

interface TutorialMarkupProps {
  html: string;
}

function renderNode(node: Node, key: string): ReactNode {
  if (node instanceof Text) return node.data;
  if (!(node instanceof HTMLElement)) return null;

  const children = Array.from(node.childNodes, (child, index) => renderNode(child, `${key}-${index}`));
  switch (node.tagName) {
    case 'B':
    case 'STRONG':
      return <strong key={key}>{children}</strong>;
    case 'BR':
      return <br key={key} />;
    case 'CODE':
      return <code key={key}>{children}</code>;
    case 'EM':
    case 'I':
      return <em key={key}>{children}</em>;
    case 'KBD':
      return (
        <kbd key={key} className={node.className || undefined}>
          {children}
        </kbd>
      );
    case 'SPAN':
      return (
        <span
          key={key}
          className={node.className || undefined}
          style={{
            color: node.style.color || undefined,
            fontFamily: node.style.fontFamily || undefined,
            fontSize: node.style.fontSize || undefined,
            textShadow: node.style.textShadow || undefined,
            verticalAlign: node.style.verticalAlign || undefined,
          }}
        >
          {children}
        </span>
      );
    case 'SCRIPT':
    case 'STYLE':
      return null;
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

export function TutorialMarkup({ html }: TutorialMarkupProps) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(document.body.childNodes, (node, index) => renderNode(node, `markup-${index}`));
}
