import { CanvasNodeType } from "src/@types/AdvancedJsonCanvas"
import TextHelper from "src/utils/text-helper"

export interface StyleAttributeOption {
  icon: string
  label: string
  value: string | null // The element with the null value is the default
}

export interface StyleAttribute {
  key: string
  label: string
  nodeTypes?: CanvasNodeType[]
  options: StyleAttributeOption[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Extra properties have any type
export function styleAttributeValidator(json: Record<string, any>): StyleAttribute | null {
  const hasKey = json.key !== undefined
  const hasLabel = json.label !== undefined
  const hasOptions = Array.isArray(json.options)

  if (!hasKey) console.error('Style attribute is missing the "key" property')
  if (!hasLabel) console.error('Style attribute is missing the "label" property')
  if (!hasOptions) console.error('Style attribute is missing the "options" property or it is not an array')

  // Camel case the key
  json.key = TextHelper.toCamelCase(json.key)

  let optionsValid = true
  let hasDefault = false
  for (const option of json.options) {
    const hasIcon = option.icon !== undefined
    const hasLabel = option.label !== undefined
    const hasValue = option.value !== undefined

    if (!hasIcon) console.error(`Style attribute option (${option.value ?? option.label}) is missing the "icon" property`)
    if (!hasLabel) console.error(`Style attribute option (${option.value}) is missing the "label" property`)
    if (!hasValue) console.error(`Style attribute option (${option.label}) is missing the "value" property`)

    if (!hasIcon || !hasLabel || !hasValue) optionsValid = false
    if (option.value === null) hasDefault = true
  }
  if (!hasDefault) console.error('Style attribute is missing a default option (option with a "value" of null)')

  const isValid = hasKey && hasLabel && hasOptions && optionsValid && hasDefault
  return isValid ? json as StyleAttribute : null
}

export const BUILTIN_NODE_STYLE_ATTRIBUTES = [
  {
    key: 'textAlign',
    label: 'Text Alignment',
    nodeTypes: ['text'],
    options: [
      {
        icon: 'align-left',
        label: 'Left',
        value: null
      },
      {
        icon: 'align-center',
        label: 'Center',
        value: 'center'
      },
      {
        icon: 'align-right',
        label: 'Right',
        value: 'right'
      }
    ]
  },
  {
    key: 'shape',
    label: 'Shape',
    nodeTypes: ['text'],
    options: [
      {
        icon: 'rectangle-horizontal',
        label: 'Round Rectangle',
        value: null
      },
      {
        icon: 'shape-pill',
        label: 'Pill',
        value: 'pill'
      },
      {
        icon: 'diamond',
        label: 'Diamond',
        value: 'diamond'
      },
      {
        icon: 'shape-parallelogram',
        label: 'Parallelogram',
        value: 'parallelogram'
      },
      {
        icon: 'circle',
        label: 'Circle',
        value: 'circle'
      },
      {
        icon: 'shape-predefined-process',
        label: 'Predefined Process',
        value: 'predefined-process'
      },
      {
        icon: 'shape-document',
        label: 'Document',
        value: 'document'
      },
      {
        icon: 'shape-database',
        label: 'Database',
        value: 'database'
      }
    ]
  },
  {
    // Added by an LLM agent
    key: 'groupLabelSize',
    label: 'Label Size',
    nodeTypes: ['group'],
    options: [
      {
        icon: 'label-size-small',
        label: 'Small (0.75x)',
        value: '0.75'
      },
      {
        icon: 'label-size-default',
        label: 'Default (1x)',
        value: null
      },
      {
        icon: 'label-size-large',
        label: 'Large (1.5x)',
        value: '1.5'
      },
      {
        icon: 'label-size-huge',
        label: 'Huge (2x)',
        value: '2'
      },
      {
        icon: 'label-size-huge',
        label: 'Giant (3x)',
        value: '3'
      }
    ]
  },
  {
    // Added by an LLM agent
    key: 'groupOpacity',
    label: 'Opacity',
    nodeTypes: ['group'],
    options: [
      {
        icon: 'opacity-default',
        label: 'Default',
        value: null
      },
	  {
        icon: 'opacity-0',
        label: '0%',
        value: '0'
      },
      {
        icon: 'opacity-25',
        label: '25%',
        value: '0.25'
      },
      {
        icon: 'opacity-50',
        label: '50%',
        value: '0.5'
      },
      {
        icon: 'opacity-75',
        label: '75%',
        value: '0.75'
      },
      {
        icon: 'opacity-100',
        label: 'Solid (100%)',
        value: '1'
      }
    ]
  },
  {
    // Added by an LLM agent
    key: 'fontSize',
    label: 'Font Size',
    nodeTypes: ['text', 'file', 'link'],
    options: [
      {
        icon: 'label-size-small',
        label: 'Small (0.75x)',
        value: '0.75'
      },
      {
        icon: 'label-size-default',
        label: 'Default (1x)',
        value: null
      },
      {
        icon: 'label-size-large',
        label: 'Large (1.5x)',
        value: '1.5'
      },
      {
        icon: 'label-size-huge',
        label: 'Huge (2x)',
        value: '2'
      },
      {
        icon: 'label-size-huge',
        label: 'Giant (3x)',
        value: '3'
      }
    ]
  },
  {
    // Added by an LLM agent
    key: 'cardPadding',
    label: 'Card Padding',
    nodeTypes: ['text', 'file', 'link'],
    options: [
      {
        icon: 'rotate-ccw',
        label: 'Default (follows "Card node padding" setting)',
        value: null
      },
      {
        icon: 'ban',
        label: 'None (0, 0)',
        value: '0,0'
      },
      {
        icon: 'square',
        label: 'Small (8, 8)',
        value: '8,8'
      },
      {
        icon: 'box',
        label: 'Medium (16, 8)',
        value: '16,8'
      },
      {
        icon: 'boxes',
        label: 'Large (16, 16)',
        value: '16,16'
      },
      {
        icon: 'expand',
        label: 'Extra Large (24, 24)',
        value: '24,24'
      }
    ]
  },
  {
    key: 'border',
    label: 'Border',
    options: [
      {
        icon: 'border-solid',
        label: 'Solid',
        value: null
      },
      {
        icon: 'border-dashed',
        label: 'Dashed',
        value: 'dashed'
      },
      {
        icon: 'border-dotted',
        label: 'Dotted',
        value: 'dotted'
      },
      {
        icon: 'eye-off',
        label: 'Invisible',
        value: 'invisible'
      }
    ]
  }
] as StyleAttribute[]

export const BUILTIN_EDGE_STYLE_ATTRIBUTES = [
  {
    key: 'path',
    label: 'Path Style',
    options: [
      {
        icon: 'path-solid',
        label: 'Solid',
        value: null
      },
      {
        icon: 'path-dotted',
        label: 'Dotted',
        value: 'dotted'
      },
      {
        icon: 'path-short-dashed',
        label: 'Short Dashed',
        value: 'short-dashed'
      },
      {
        icon: 'path-long-dashed',
        label: 'Long Dashed',
        value: 'long-dashed'
      },
      {
        // Added by an LLM agent
        icon: 'eye-off',
        label: 'Invisible',
        value: 'invisible'
      }
    ]
  },
  {
    key: 'arrow',
    label: 'Arrow Style',
    options: [
      {
        icon: 'arrow-triangle',
        label: 'Triangle',
        value: null
      },
      {
        icon: 'arrow-triangle-outline',
        label: 'Triangle Outline',
        value: 'triangle-outline'
      },
      {
        icon: 'arrow-thin-triangle',
        label: 'Thin Triangle',
        value: 'thin-triangle'
      },
      {
        icon: 'arrow-halved-triangle',
        label: 'Halved Triangle',
        value: 'halved-triangle'
      },
      {
        icon: 'arrow-diamond',
        label: 'Diamond',
        value: 'diamond'
      },
      {
        icon: 'arrow-diamond-outline',
        label: 'Diamond Outline',
        value: 'diamond-outline'
      },
      {
        icon: 'arrow-circle',
        label: 'Circle',
        value: 'circle'
      },
      {
        icon: 'arrow-circle-outline',
        label: 'Circle Outline',
        value: 'circle-outline'
      },
      {
        icon: 'tally-1',
        label: 'Blunt',
        value: 'blunt'
      }
    ]
  },
  {
    key: 'edgeWidth',
    label: 'Edge Width',
    options: [
      {
        icon: 'edge-width-default',
        label: 'Default (1x)',
        value: null
      },
      {
        icon: 'edge-width-thin',
        label: 'Thin (2x)',
        value: '2'
      },
      {
        icon: 'edge-width-thick',
        label: 'Thick (4)',
        value: '4'
      },
      {
        icon: 'edge-width-extra-thick',
        label: 'Extra Thick (8x)',
        value: '8'
      }
    ]
  },
  {
    key: 'arrowSize',
    label: 'Arrow Size',
    options: [
      {
        icon: 'arrow-size-default',
        label: 'Default (1x)',
        value: null
      },
      {
        icon: 'arrow-size-small',
        label: 'Small (2x)',
        value: '2'
      },
      {
        icon: 'arrow-size-large',
        label: 'Large (3x)',
        value: '3'
      },
      {
        icon: 'arrow-size-extra-large',
        label: 'Extra Large (4x)',
        value: '4'
      }
    ]
  },
  {
    key: 'pathfindingMethod',
    label: 'Pathfinding Method',
    options: [
      {
        icon: 'pathfinding-method-bezier',
        label: 'Bezier',
        value: null
      },
      {
        icon: 'slash',
        label: 'Direct',
        value: 'direct'
      },
      {
        icon: 'pathfinding-method-square',
        label: 'Square',
        value: 'square'
      },
      {
        icon: 'map',
        label: 'A*',
        value: 'a-star'
      }
    ]
  },
  {
    // Added by an LLM agent: consumed by the bezier curvature feature (bezier-curvature-canvas-extension.ts)
    // Only affects edges without a pathfinding method; the value scales the bezier control points
    key: 'bezierCurvature',
    label: 'Bezier Curvature',
    options: [
      {
        icon: 'spline',
        label: 'Default (100%)',
        value: null
      },
      {
        icon: 'minus',
        label: 'Subtle (150%)',
        value: '1.5'
      },
      {
        icon: 'corner-up-right',
        label: 'Gentle (200%)',
        value: '2'
      },
      {
        icon: 'rainbow',
        label: 'Strong (300%)',
        value: '3'
      },
      {
        icon: 'wind',
        label: 'Extreme (500%)',
        value: '5'
      }
    ]
  },
  {
    // Added by an LLM agent: consumed by the z-ordering feature (z-ordering-canvas-extension.ts)
    key: 'zIndex',
    label: 'Z-Index',
    options: [
      {
        icon: 'send-to-back',
        label: 'Back (-1)',
        value: '-1'
      },
      {
        icon: 'minus',
        label: 'Default (0)',
        value: null
      },
      {
        icon: 'bring-to-front',
        label: 'Front (1)',
        value: '1'
      }
    ]
  }
] as StyleAttribute[]
