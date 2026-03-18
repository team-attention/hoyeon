import type { DragEvent } from 'react'
import { CATEGORIES, COMPONENT_TYPES, getComponentsByCategory } from './componentTypes'
import type { ComponentType } from './componentTypes'

interface ComponentCardProps {
  component: ComponentType
  onDragStart?: (e: DragEvent<HTMLDivElement>, component: ComponentType) => void
}

function ComponentCard({ component, onDragStart }: ComponentCardProps) {
  return (
    <div
      className="component-card"
      draggable
      onDragStart={(e) => onDragStart?.(e, component)}
      data-component-id={component.id}
      data-component-name={component.name}
      data-component-category={component.category}
      title={component.name}
    >
      <span className="component-icon">{component.icon}</span>
      <span className="component-name">{component.name}</span>
    </div>
  )
}

interface ComponentLibraryProps {
  onDragStart?: (e: DragEvent<HTMLDivElement>, component: ComponentType) => void
}

export function ComponentLibrary({ onDragStart }: ComponentLibraryProps) {
  return (
    <div className="component-library" data-testid="component-library">
      {CATEGORIES.map((category) => (
        <div key={category} className="component-category" data-testid={`category-${category.toLowerCase()}`}>
          <h3 className="category-title">{category}</h3>
          <div className="category-components">
            {getComponentsByCategory(category).map((component) => (
              <ComponentCard
                key={component.id}
                component={component}
                onDragStart={onDragStart}
              />
            ))}
          </div>
        </div>
      ))}
      <div data-testid="total-components" style={{ display: 'none' }}>
        {COMPONENT_TYPES.length}
      </div>
    </div>
  )
}

export default ComponentLibrary
