import { useState } from 'react'
import { ComponentLibrary } from '../library/ComponentLibrary'

type LeftPanelTab = 'layers' | 'components'

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('layers')

  return (
    <div data-testid="left-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab Bar */}
      <div data-testid="left-panel-tabs" style={{ display: 'flex', borderBottom: '1px solid #333' }}>
        <button
          data-testid="tab-layers"
          onClick={() => setActiveTab('layers')}
          style={{
            flex: 1,
            padding: '8px',
            background: activeTab === 'layers' ? '#252525' : 'transparent',
            color: activeTab === 'layers' ? '#e0e0e0' : '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Layers
        </button>
        <button
          data-testid="tab-components"
          onClick={() => setActiveTab('components')}
          style={{
            flex: 1,
            padding: '8px',
            background: activeTab === 'components' ? '#252525' : 'transparent',
            color: activeTab === 'components' ? '#e0e0e0' : '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Components
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'layers' ? (
          <div data-testid="layers-panel">
            <p style={{ padding: '8px', color: '#888', fontSize: 12 }}>No layers yet</p>
          </div>
        ) : (
          <ComponentLibrary />
        )}
      </div>
    </div>
  )
}

export default LeftPanel
