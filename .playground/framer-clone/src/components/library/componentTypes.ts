export type ComponentCategory = 'Layout' | 'Content' | 'Form' | 'Media'

export interface ComponentType {
  id: string
  name: string
  category: ComponentCategory
  icon: string
  defaultProps: Record<string, unknown>
}

export const COMPONENT_TYPES: ComponentType[] = [
  // Layout
  {
    id: 'frame',
    name: 'Frame',
    category: 'Layout',
    icon: 'frame',
    defaultProps: { width: 200, height: 200, backgroundColor: 'rgba(255,255,255,0.1)' },
  },
  // Content
  {
    id: 'text',
    name: 'Text',
    category: 'Content',
    icon: 'text',
    defaultProps: { content: 'Text', fontSize: 16, color: '#e0e0e0' },
  },
  {
    id: 'image',
    name: 'Image',
    category: 'Content',
    icon: 'image',
    defaultProps: { src: '', alt: 'Image', placeholder: true },
  },
  {
    id: 'divider',
    name: 'Divider',
    category: 'Content',
    icon: 'divider',
    defaultProps: { orientation: 'horizontal', color: '#333333' },
  },
  // Form
  {
    id: 'button',
    name: 'Button',
    category: 'Form',
    icon: 'button',
    defaultProps: { label: 'Button', variant: 'primary' },
  },
  {
    id: 'input',
    name: 'Input',
    category: 'Form',
    icon: 'input',
    defaultProps: { placeholder: 'Enter text...', type: 'text' },
  },
  // Media
  {
    id: 'video',
    name: 'Video',
    category: 'Media',
    icon: 'video',
    defaultProps: { src: '', autoPlay: false, loop: false },
  },
  {
    id: 'icon',
    name: 'Icon',
    category: 'Media',
    icon: 'icon',
    defaultProps: { name: 'star', size: 24, color: '#e0e0e0' },
  },
]

export const CATEGORIES: ComponentCategory[] = ['Layout', 'Content', 'Form', 'Media']

export const getComponentsByCategory = (category: ComponentCategory): ComponentType[] =>
  COMPONENT_TYPES.filter((c) => c.category === category)
