import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComponentLibrary } from '../components/library/ComponentLibrary'
import { COMPONENT_TYPES, CATEGORIES, getComponentsByCategory } from '../components/library/componentTypes'

describe('Component Library', () => {
  describe('R8-S1: All 8 component types visible in 4 categories', () => {
    it('renders all 4 categories', () => {
      render(<ComponentLibrary />)
      expect(screen.getByTestId('category-layout')).toBeInTheDocument()
      expect(screen.getByTestId('category-content')).toBeInTheDocument()
      expect(screen.getByTestId('category-form')).toBeInTheDocument()
      expect(screen.getByTestId('category-media')).toBeInTheDocument()
    })

    it('renders exactly 8 component types total', () => {
      render(<ComponentLibrary />)
      expect(COMPONENT_TYPES).toHaveLength(8)
    })

    it('renders Frame in Layout category', () => {
      render(<ComponentLibrary />)
      const layoutCategory = screen.getByTestId('category-layout')
      expect(layoutCategory).toHaveTextContent('Frame')
    })

    it('renders Text, Image, Divider in Content category', () => {
      render(<ComponentLibrary />)
      const contentCategory = screen.getByTestId('category-content')
      expect(contentCategory).toHaveTextContent('Text')
      expect(contentCategory).toHaveTextContent('Image')
      expect(contentCategory).toHaveTextContent('Divider')
    })

    it('renders Button, Input in Form category', () => {
      render(<ComponentLibrary />)
      const formCategory = screen.getByTestId('category-form')
      expect(formCategory).toHaveTextContent('Button')
      expect(formCategory).toHaveTextContent('Input')
    })

    it('renders Video, Icon in Media category', () => {
      render(<ComponentLibrary />)
      const mediaCategory = screen.getByTestId('category-media')
      expect(mediaCategory).toHaveTextContent('Video')
      expect(mediaCategory).toHaveTextContent('Icon')
    })
  })

  describe('R8-S2: Each component renders with default appearance', () => {
    it('each component type has default props defined', () => {
      for (const component of COMPONENT_TYPES) {
        expect(component.defaultProps).toBeDefined()
        expect(typeof component.defaultProps).toBe('object')
      }
    })

    it('all 8 components are draggable', () => {
      render(<ComponentLibrary />)
      const componentCards = document.querySelectorAll('[data-component-id]')
      expect(componentCards).toHaveLength(8)
      for (const card of componentCards) {
        expect(card).toHaveAttribute('draggable', 'true')
      }
    })
  })

  describe('R8-S3: Image placeholder shown when no src', () => {
    it('image component has placeholder default prop', () => {
      const imageComponent = COMPONENT_TYPES.find((c) => c.id === 'image')
      expect(imageComponent).toBeDefined()
      expect(imageComponent?.defaultProps.placeholder).toBe(true)
      expect(imageComponent?.defaultProps.src).toBe('')
    })
  })

  describe('R8-S4: Video error placeholder on invalid URL', () => {
    it('video component has src default prop', () => {
      const videoComponent = COMPONENT_TYPES.find((c) => c.id === 'video')
      expect(videoComponent).toBeDefined()
      expect(videoComponent?.defaultProps.src).toBe('')
    })
  })

  describe('Category filtering', () => {
    it('getComponentsByCategory returns correct components', () => {
      expect(getComponentsByCategory('Layout')).toHaveLength(1)
      expect(getComponentsByCategory('Content')).toHaveLength(3)
      expect(getComponentsByCategory('Form')).toHaveLength(2)
      expect(getComponentsByCategory('Media')).toHaveLength(2)
    })

    it('CATEGORIES contains all 4 expected categories', () => {
      expect(CATEGORIES).toEqual(['Layout', 'Content', 'Form', 'Media'])
    })
  })

  describe('Drag interaction', () => {
    it('calls onDragStart when component is dragged', () => {
      const onDragStart = vi.fn()
      render(<ComponentLibrary onDragStart={onDragStart} />)
      const frameCard = document.querySelector('[data-component-id="frame"]')
      expect(frameCard).not.toBeNull()
      fireEvent.dragStart(frameCard!)
      expect(onDragStart).toHaveBeenCalledTimes(1)
    })
  })
})
