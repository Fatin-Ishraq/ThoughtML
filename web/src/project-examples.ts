import snakeProject from '../../examples/snake-project/project.thml?raw'
import snakeProduct from '../../examples/snake-project/product.thml?raw'
import snakeArchitecture from '../../examples/snake-project/architecture.thml?raw'
import snakeGameplay from '../../examples/snake-project/gameplay.thml?raw'
import snakeQuality from '../../examples/snake-project/quality.thml?raw'
import snakeRelease from '../../examples/snake-project/release.thml?raw'

export interface WorkspaceSeed {
  entry: string
  files: Record<string, string>
}

/** A real multi-file project, also checked by the native CLI from examples/. */
export const SNAKE_PROJECT: WorkspaceSeed = {
  entry: 'project.thml',
  files: {
    'project.thml': snakeProject,
    'product.thml': snakeProduct,
    'architecture.thml': snakeArchitecture,
    'gameplay.thml': snakeGameplay,
    'quality.thml': snakeQuality,
    'release.thml': snakeRelease,
  },
}
