import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorLayout } from '../components/editor/EditorLayout'
import { LeftPanel } from '../components/editor/LeftPanel'

describe('Editor Layout', () => {
  describe('R11-S1: Editor displays 3-panel layout with toolbar', () => {
    it('renders the toolbar', () => {
      render(<EditorLayout />)
      expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument()
    })

    it('renders the left panel', () => {
      render(<EditorLayout />)
      expect(screen.getByTestId('editor-left-panel')).toBeInTheDocument()
    })

    it('renders the center canvas', () => {
      render(<EditorLayout />)
      expect(screen.getByTestId('editor-canvas')).toBeInTheDocument()
    })

    it('renders the right panel', () => {
      render(<EditorLayout />)
      expect(screen.getByTestId('editor-right-panel')).toBeInTheDocument()
    })

    it('renders all panels in a single EditorLayout', () => {
      render(<EditorLayout />)
      const layout = screen.getByTestId('editor-layout')
      expect(layout).toBeInTheDocument()
      expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument()
      expect(screen.getByTestId('editor-left-panel')).toBeInTheDocument()
      expect(screen.getByTestId('editor-canvas')).toBeInTheDocument()
      expect(screen.getByTestId('editor-right-panel')).toBeInTheDocument()
    })
  })

  describe('R11-S2: Left panel toggles between Layers and Components tabs', () => {
    it('shows layers tab by default', () => {
      render(<LeftPanel />)
      expect(screen.getByTestId('layers-panel')).toBeInTheDocument()
    })

    it('shows component library when Components tab is clicked', () => {
      render(<LeftPanel />)
      const componentsTab = screen.getByTestId('tab-components')
      fireEvent.click(componentsTab)
      expect(screen.getByTestId('component-library')).toBeInTheDocument()
    })

    it('switches back to layers when Layers tab is clicked', () => {
      render(<LeftPanel />)
      // Switch to components
      fireEvent.click(screen.getByTestId('tab-components'))
      expect(screen.getByTestId('component-library')).toBeInTheDocument()
      // Switch back to layers
      fireEvent.click(screen.getByTestId('tab-layers'))
      expect(screen.getByTestId('layers-panel')).toBeInTheDocument()
    })
  })

  describe('R11-S4: Panel collapse expands canvas', () => {
    it('left panel collapses when collapse button is clicked', () => {
      render(<EditorLayout />)
      const leftPanel = screen.getByTestId('editor-left-panel')
      const collapseBtn = screen.getByTestId('collapse-left-panel')

      // Initially visible
      expect(leftPanel).toBeInTheDocument()

      // Click collapse
      fireEvent.click(collapseBtn)

      // After collapse, width should be 0 (panel collapsed)
      expect(leftPanel.style.width).toBe('0px')
    })

    it('right panel collapses when collapse button is clicked', () => {
      render(<EditorLayout />)
      const rightPanel = screen.getByTestId('editor-right-panel')
      const collapseBtn = screen.getByTestId('collapse-right-panel')

      expect(rightPanel).toBeInTheDocument()

      fireEvent.click(collapseBtn)

      expect(rightPanel.style.width).toBe('0px')
    })
  })
})
