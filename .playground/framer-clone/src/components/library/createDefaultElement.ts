import type { Element, ElementType } from '../../types'

let _idCounter = 1

/** Generate a unique element id (stable across tests when counter is reset) */
export function generateElementId(type: ElementType): string {
  return `${type}-${Date.now()}-${_idCounter++}`
}

/** Create a fully-typed Element with all required fields for a given component type and canvas position */
export function createDefaultElement(
  componentId: string,
  x: number,
  y: number
): Element | null {
  const type = componentId as ElementType
  const id = generateElementId(type)
  const name = `${type.charAt(0).toUpperCase()}${type.slice(1)} ${_idCounter}`

  const base = {
    id,
    type,
    x,
    y,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name,
    parentId: null,
    children: [],
    zIndex: 0,
  }

  switch (type) {
    case 'frame':
      return {
        ...base,
        type: 'frame',
        width: 200,
        height: 200,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#333',
        overflow: 'visible',
        layoutMode: 'none',
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }

    case 'text':
      return {
        ...base,
        type: 'text',
        width: 120,
        height: 32,
        content: 'Text',
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#e0e0e0',
        lineHeight: 1.5,
        letterSpacing: 0,
        textDecoration: 'none',
      }

    case 'image':
      return {
        ...base,
        type: 'image',
        width: 200,
        height: 150,
        src: '',
        alt: 'Image',
        objectFit: 'cover',
        borderRadius: 0,
      }

    case 'button':
      return {
        ...base,
        type: 'button',
        width: 100,
        height: 36,
        label: 'Button',
        backgroundColor: '#0a84ff',
        textColor: '#ffffff',
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 500,
        variant: 'filled',
      }

    case 'input':
      return {
        ...base,
        type: 'input',
        width: 200,
        height: 36,
        placeholder: 'Enter text...',
        value: '',
        inputType: 'text',
        backgroundColor: '#242424',
        textColor: '#e0e0e0',
        borderRadius: 4,
        borderColor: '#444',
      }

    case 'video':
      return {
        ...base,
        type: 'video',
        width: 320,
        height: 180,
        src: '',
        autoPlay: false,
        loop: false,
        muted: true,
        controls: true,
        objectFit: 'contain',
        borderRadius: 0,
      }

    case 'icon':
      return {
        ...base,
        type: 'icon',
        width: 32,
        height: 32,
        iconName: 'star',
        color: '#e0e0e0',
        size: 24,
      }

    case 'divider':
      return {
        ...base,
        type: 'divider',
        width: 200,
        height: 2,
        orientation: 'horizontal',
        color: '#333333',
        thickness: 1,
        style: 'solid',
      }

    default:
      return null
  }
}
