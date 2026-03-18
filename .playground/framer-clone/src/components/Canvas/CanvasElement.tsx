import type { Element } from '../../types'

interface CanvasElementProps {
  element: Element
  isSelected: boolean
  zoom: number
  onClick: (id: string, e: React.MouseEvent) => void
}

export function CanvasElement({ element, isSelected, zoom: _zoom, onClick }: CanvasElementProps) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: element.zIndex,
    boxSizing: 'border-box',
    outline: isSelected ? '2px solid #0a84ff' : 'none',
    cursor: 'default',
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick(element.id, e)
  }

  if (element.type === 'frame') {
    return (
      <div
        data-testid={`canvas-element-${element.id}`}
        data-element-id={element.id}
        style={{
          ...baseStyle,
          backgroundColor: element.backgroundColor,
          borderRadius: element.borderRadius,
          border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : 'none',
          overflow: element.overflow === 'scroll' ? 'auto' : element.overflow,
        }}
        onClick={handleClick}
      />
    )
  }

  if (element.type === 'text') {
    return (
      <div
        data-testid={`canvas-element-${element.id}`}
        data-element-id={element.id}
        style={{
          ...baseStyle,
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          fontWeight: element.fontWeight,
          fontStyle: element.fontStyle,
          textAlign: element.textAlign,
          color: element.color,
          lineHeight: element.lineHeight,
          letterSpacing: element.letterSpacing,
          textDecoration: element.textDecoration,
          userSelect: 'none',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}
        onClick={handleClick}
      >
        {element.content}
      </div>
    )
  }

  if (element.type === 'image') {
    return (
      <div
        data-testid={`canvas-element-${element.id}`}
        data-element-id={element.id}
        style={{ ...baseStyle, overflow: 'hidden', borderRadius: element.borderRadius }}
        onClick={handleClick}
      >
        <img
          src={element.src}
          alt={element.alt}
          style={{ width: '100%', height: '100%', objectFit: element.objectFit, display: 'block' }}
        />
      </div>
    )
  }

  if (element.type === 'button') {
    return (
      <button
        data-testid={`canvas-element-${element.id}`}
        data-element-id={element.id}
        style={{
          ...baseStyle,
          backgroundColor:
            element.variant === 'ghost' ? 'transparent' : element.backgroundColor,
          color: element.textColor,
          borderRadius: element.borderRadius,
          fontSize: element.fontSize,
          fontWeight: element.fontWeight,
          border:
            element.variant === 'outlined'
              ? `2px solid ${element.backgroundColor}`
              : 'none',
        }}
        onClick={handleClick}
      >
        {element.label}
      </button>
    )
  }

  // Fallback for other element types
  return (
    <div
      data-testid={`canvas-element-${element.id}`}
      data-element-id={element.id}
      style={{ ...baseStyle, background: '#444' }}
      onClick={handleClick}
    />
  )
}
