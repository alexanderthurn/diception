# PixiJS

> PixiJS is the fastest, most lightweight 2D library available for the web, working across all devices and allowing you to create rich, interactive graphics and cross-platform applications using WebGL, WebGPU, and Canvas as a fallback.

## core-concepts

- [Architecture](./core-concepts.html.md): A comprehensive guide to the architecture of PixiJS, including its major components and extension system.
- [Scene Graph](./core-concepts-1.html.md): Understanding the PixiJS scene graph, its structure, and how to manage parent-child relationships, render order, and culling for optimal performance.
- [Render Loop](./core-concepts-2.html.md): Understanding the PixiJS render loop, including how it updates the scene graph and renders frames efficiently.
- [Render Groups](./core-concepts-3.html.md): Learn how to use Render Groups in PixiJS to optimize rendering performance by grouping scene elements for efficient GPU processing.
- [Render Layers](./core-concepts-4.html.md): Understanding PixiJS Render Layers for controlling rendering order independently of logical hierarchy.
- [Environments](./core-concepts-5.html.md): Learn how PixiJS adapts to different environments like browsers, Web Workers, and custom execution contexts, and how to configure it for your needs.
- [Garbage Collection](./core-concepts-6.html.md): Managing GPU resources and garbage collection in PixiJS for optimal performance.
- [Performance Tips](./core-concepts-7.html.md): Performance tips for optimizing PixiJS applications, covering general practices and specific techniques for maximizing rendering efficiency.

## accessibility

- [Overview](./accessibility.html.md): Use PixiJS's built-in accessibility features to make your applications inclusive for users with disabilities.
- [AccessibilitySystem](./accessibility.AccessibilitySystem.html.md): The Accessibility system provides screen reader and keyboard navigation support for PixiJS content.

## app

- [Overview](./app.html.md): Create and configure a PixiJS Application with WebGL, WebGPU, or Canvas rendering, built-in plugins, and custom application plugins.
- [Ticker Plugin](./app-1.html.md): Use the TickerPlugin in PixiJS for rendering and frame updates.
- [Resize Plugin](./app-2.html.md): Use the ResizePlugin in PixiJS to make your application responsive to window or element size changes.
- [Culler Plugin](./app-3.html.md): Use the CullerPlugin in PixiJS to skip rendering for offscreen objects.
- [Application](./app.Application.html.md): Convenience class to create a new PixiJS application.
- [CullerPlugin](./app.CullerPlugin.html.md): An {@link Application} plugin that automatically culls (hides) display objects that are outside the visible screen area.
- [ResizePlugin](./app.ResizePlugin.html.md): Middleware for Application's resize functionality.
- [TickerPlugin](./app.TickerPlugin.html.md): Middleware for Application's {@link Ticker} functionality.

## assets

- [Overview](./assets.html.md): Learn how to load, cache, and manage assets in PixiJS using the Assets API, including textures, fonts, spritesheets, and bundles with format detection and background loading.
- [Resolver](./assets-1.html.md): Learn how to use PixiJS's asset resolver for dynamic, multi-format asset loading with platform-aware optimizations.
- [Manifests and Bundles](./assets-2.html.md): Learn how to manage assets in PixiJS using manifests and bundles, and how to automate this with AssetPack.
- [Background Loader](./assets-3.html.md): Learn how to use the PixiJS background loader to load assets in the background, improving application responsiveness and reducing load times.
- [Compressed Textures](./assets-4.html.md): Learn how to use compressed textures in PixiJS for lower memory usage and faster GPU uploads.
- [SVGs](./assets-5.html.md): Learn how to render SVGs in PixiJS, including using them as textures or graphics, and understand their advantages and limitations.
- [Assets](./assets.Assets.html.md): The global Assets class is a singleton that manages loading, caching, and unloading of all resources in your PixiJS application.
- [Spritesheet](./assets.Spritesheet.html.md): Utility class for maintaining reference to a collection of Textures on a single Spritesheet.

## color

- [Overview](./color.html.md): Learn how to use the Color class in PixiJS for creating, converting, and manipulating colors across multiple formats including hex, RGB, HSL, and CSS color names.
- [Color](./color.Color.html.md): Color utility class for managing colors in various formats.

## environment

- [Overview](./environment.html.md): Learn how to configure PixiJS for different environments including browsers, Web Workers, and custom platforms using the DOMAdapter system.

## events

- [Overview](./events.html.md): Learn how to handle mouse, touch, and pointer input in PixiJS using the federated event system with bubbling, capturing, and delegation.
- [EventSystem](./events.EventSystem.html.md): The system for handling UI events in PixiJS applications.
- [FederatedEvent](./events.FederatedEvent.html.md): A DOM-compatible synthetic event implementation for PixiJS's event system.
- [FederatedMouseEvent](./events.FederatedMouseEvent.html.md): A specialized event class for mouse interactions in PixiJS applications.
- [FederatedPointerEvent](./events.FederatedPointerEvent.html.md): A specialized event class for pointer interactions in PixiJS applications.
- [FederatedWheelEvent](./events.FederatedWheelEvent.html.md): A specialized event class for wheel/scroll interactions in PixiJS applications.

## extensions

- [Overview](./extensions.html.md): Learn how to use the PixiJS extension system to register, remove, and create modular plugins for rendering, asset loading, and more.
- [extensions](./extensions.extensions.html.md): Global registration system for all PixiJS extensions.

## filters

- [Overview](./filters.html.md): Learn how to apply post-processing effects like blur, color adjustments, noise, displacement, and custom shaders to display objects in PixiJS.
- [AlphaFilter](./filters.AlphaFilter.html.md): Simplest filter - applies alpha.
- [BlurFilter](./filters.BlurFilter.html.md): The BlurFilter applies a Gaussian blur to an object.
- [ColorBlend](./filters.ColorBlend.html.md): The final color has the hue and saturation of the top color, while using the luminosity of the bottom color.
- [ColorBurnBlend](./filters.ColorBurnBlend.html.md): The final color is the result of inverting the bottom color, dividing the value by the top color, and inverting that value.
- [ColorDodgeBlend](./filters.ColorDodgeBlend.html.md): The final color is the result of dividing the bottom color by the inverse of the top color.
- [ColorMatrixFilter](./filters.ColorMatrixFilter.html.md): The ColorMatrixFilter class lets you apply color transformations to display objects using a 5x4 matrix.
- [DarkenBlend](./filters.DarkenBlend.html.md): The final color is composed of the darkest values of each color channel.
- [DifferenceBlend](./filters.DifferenceBlend.html.md): The final color is the result of subtracting the darker of the two colors from the lighter one.
- [DisplacementFilter](./filters.DisplacementFilter.html.md): A filter that applies a displacement map effect using a sprite's texture.
- [DivideBlend](./filters.DivideBlend.html.md): The Divide blend mode divides the RGB channel values of the bottom layer by those of the top layer.
- [ExclusionBlend](./filters.ExclusionBlend.html.md): The final color is similar to difference, but with less contrast.
- [HardLightBlend](./filters.HardLightBlend.html.md): The final color is the result of multiply if the top color is darker, or screen if the top color is lighter.
- [HardMixBlend](./filters.HardMixBlend.html.md): Hard defines each of the color channel values of the blend color to the RGB values of the base color.
- [LightenBlend](./filters.LightenBlend.html.md): The final color is composed of the lightest values of each color channel.
- [LinearBurnBlend](./filters.LinearBurnBlend.html.md): Looks at the color information in each channel and darkens the base color to reflect the blend color by increasing the contrast between the two.
- [LinearDodgeBlend](./filters.LinearDodgeBlend.html.md): Looks at the color information in each channel and brightens the base color to reflect the blend color by decreasing contrast between the two.
- [LinearLightBlend](./filters.LinearLightBlend.html.md): Increase or decrease brightness by burning or dodging color values, based on the blend color Available as `container.blendMode = 'linear-light'` after importing `pixi.js/advanced-blend-modes`.
- [LuminosityBlend](./filters.LuminosityBlend.html.md): The final color has the luminosity of the top color, while using the hue and saturation of the bottom color.
- [NegationBlend](./filters.NegationBlend.html.md): Implements the Negation blend mode which creates an inverted effect based on the brightness values.
- [NoiseFilter](./filters.NoiseFilter.html.md): A filter that adds configurable random noise to rendered content.
- [OverlayBlend](./filters.OverlayBlend.html.md): The final color is the result of multiply if the bottom color is darker, or screen if the bottom color is lighter.
- [PinLightBlend](./filters.PinLightBlend.html.md): Replaces colors based on the blend color.
- [SaturationBlend](./filters.SaturationBlend.html.md): The final color has the saturation of the top color, while using the hue and luminosity of the bottom color.
- [SoftLightBlend](./filters.SoftLightBlend.html.md): The final color is similar to hard-light, but softer.
- [SubtractBlend](./filters.SubtractBlend.html.md): Subtracts the blend from the base color using each color channel Available as `container.blendMode = 'subtract'` after importing `pixi.js/advanced-blend-modes`.
- [VividLightBlend](./filters.VividLightBlend.html.md): Darkens values darker than 50% gray and lightens those brighter than 50% gray, creating a dramatic effect.

## maths

- [Overview](./maths.html.md): Learn how to use PixiJS math utilities for 2D transformations, geometry, shapes, and hit testing.
- [Circle](./maths.Circle.html.md): The Circle object represents a circle shape in a two-dimensional coordinate system.
- [Ellipse](./maths.Ellipse.html.md): The Ellipse object is used to help draw graphics and can also be used to specify a hit area for containers.
- [Matrix](./maths.Matrix.html.md): A fast matrix for 2D transformations.
- [ObservablePoint](./maths.ObservablePoint.html.md): The ObservablePoint object represents a location in a two-dimensional coordinate system.
- [Point](./maths.Point.html.md): The Point object represents a location in a two-dimensional coordinate system, where `x` represents the position on the horizontal axis and `y` represents the position on the vertical axis.
- [Polygon](./maths.Polygon.html.md): A class to define a shape via user defined coordinates.
- [Rectangle](./maths.Rectangle.html.md): The `Rectangle` object represents a rectangular area defined by its position and dimensions.
- [RoundedRectangle](./maths.RoundedRectangle.html.md): The `RoundedRectangle` object represents a rectangle with rounded corners.
- [Triangle](./maths.Triangle.html.md): A class to define a shape of a triangle via user defined coordinates.
- [DEG_TO_RAD](./maths.DEG_TO_RAD.html.md): Conversion factor for converting degrees to radians.
- [PI_2](./maths.PI_2.html.md): Two Pi.
- [RAD_TO_DEG](./maths.RAD_TO_DEG.html.md): Conversion factor for converting radians to degrees.

## rendering

- [Overview](./rendering.html.md): Learn how PixiJS renderers draw scenes using WebGL, WebGPU, and Canvas 2D, including renderer selection, systems, and render targets.
- [Textures](./rendering-1.html.md): Learn how PixiJS handles textures, their lifecycle, creation, and types, and how to manage GPU resources.
- [Bounds](./rendering.Bounds.html.md): A representation of an axis-aligned bounding box (AABB) used for efficient collision detection and culling.
- [CanvasRenderer](./rendering.CanvasRenderer.html.md): The Canvas PixiJS Renderer.
- [ExtractSystem](./rendering.ExtractSystem.html.md): System for exporting content from a renderer.
- [GenerateTextureSystem](./rendering.GenerateTextureSystem.html.md): System that manages the generation of textures from display objects in the renderer.
- [Texture](./rendering.Texture.html.md): A texture stores the information that represents an image or part of an image.
- [WebGLRenderer](./rendering.WebGLRenderer.html.md): The WebGL PixiJS Renderer.
- [WebGPURenderer](./rendering.WebGPURenderer.html.md): The WebGPU PixiJS Renderer.
- [autoDetectRenderer](./rendering.autoDetectRenderer.html.md): Automatically determines the most appropriate renderer for the current environment.

## scene

- [Overview](./scene.html.md): Learn how to use scene objects in PixiJS, including containers, sprites, transforms, and more. This guide covers the basics of building your scene graph.
- [Container](./scene-1.html.md): Learn how to create and manage Containers in PixiJS, including adding/removing children, sorting, and caching as textures.
- [Cache as Texture](./scene-2.html.md): Learn how to use cacheAsTexture in PixiJS to optimize rendering performance by caching containers as textures. Understand its benefits, usage, and guidelines.
- [Sprite](./scene-3.html.md): Learn how to create and manipulate Sprites in PixiJS, including texture updates, scaling, and transformations.
- [NineSlice Sprite](./scene-4.html.md): Learn how to use the NineSliceSprite class in PixiJS for creating scalable UI elements with preserved corners and edges.
- [Tiling Sprite](./scene-5.html.md): Learn how to use the TilingSprite class in PixiJS for rendering repeating textures efficiently across a defined area.
- [Graphics](./scene-6.html.md): Learn how to use PixiJS Graphics to create shapes, manage graphics contexts, and optimize performance in your projects.
- [Graphics Fill](./scene-7.html.md): Learn how to use the fill method in PixiJS to fill shapes with colors, textures, and gradients, enhancing your graphics and text rendering.
- [Graphics Pixel Line](./scene-8.html.md): Learn how to use the pixelLine property in PixiJS Graphics API to create crisp, pixel-perfect lines that remain consistent under scaling and transformations.
- [Text](./scene-9.html.md): Learn how to use PixiJS's text rendering classes Text, BitmapText, and HTMLText.
- [Text (Canvas)](./scene-10.html.md): Learn how to use the Text class in PixiJS to render styled text as display objects, including dynamic updates and font loading.
- [Bitmap Text](./scene-11.html.md): Learn how to use BitmapText in PixiJS for high-performance text rendering with pre-generated texture atlases.
- [HTML Text](./scene-12.html.md): Learn how to use HTMLText in PixiJS to render styled HTML strings within your WebGL canvas, enabling complex typography and inline formatting.
- [Text Style](./scene-13.html.md): Learn how to use the TextStyle class in PixiJS to style text objects, including fills, strokes, shadows, and more.
- [SplitText & SplitBitmapText](./scene-14.html.md)
- [Mesh](./scene-15.html.md): Learn how to create and manipulate meshes in PixiJS v8, including custom geometry, shaders, and built-in mesh types like MeshSimple, MeshRope, and PerspectiveMesh.
- [Particle Container](./scene-16.html.md): Learn how to use the ParticleContainer and Particle classes in PixiJS for high-performance particle systems.
- [AnimatedSprite](./scene.AnimatedSprite.html.md): An AnimatedSprite is a simple way to display an animation depicted by a list of textures.
- [Container](./scene.Container.html.md): Container is a general-purpose display object that holds children.
- [Culler](./scene.Culler.html.md): The Culler class is responsible for managing and culling containers.
- [DOMContainer](./scene.DOMContainer.html.md): The DOMContainer object is used to render DOM elements within the PixiJS scene graph.
- [FillGradient](./scene.FillGradient.html.md): Class representing a gradient fill that can be used to fill shapes and text.
- [FillPattern](./scene.FillPattern.html.md): A class that represents a fill pattern for use in Text and Graphics fills.
- [Graphics](./scene.Graphics.html.md): The Graphics class is primarily used to render primitive shapes such as lines, circles and rectangles to the display, and to color and fill them.
- [GraphicsContext](./scene.GraphicsContext.html.md): The GraphicsContext class allows for the creation of lightweight objects that contain instructions for drawing shapes and paths.
- [MeshPlane](./scene.MeshPlane.html.md): A mesh that renders a texture mapped to a plane with configurable vertex density.
- [MeshRope](./scene.MeshRope.html.md): A specialized mesh that renders a texture along a path defined by points.
- [NineSlicePlane](./scene.NineSlicePlane.html.md): Please use the {@link NineSliceSprite} class instead.
- [NineSliceSprite](./scene.NineSliceSprite.html.md): The NineSliceSprite allows you to stretch a texture using 9-slice scaling.
- [Particle](./scene.Particle.html.md): Represents a single particle within a particle container.
- [ParticleContainer](./scene.ParticleContainer.html.md): The ParticleContainer class is a highly optimized container that can render 1000s or particles at great speed.
- [PerspectiveMesh](./scene.PerspectiveMesh.html.md): A perspective mesh that allows you to draw a 2d plane with perspective.
- [RenderLayer](./scene.RenderLayer.html.md): The RenderLayer API provides a way to control the rendering order of objects independently of their logical parent-child relationships in the scene graph.
- [Sprite](./scene.Sprite.html.md): The Sprite object is one of the most important objects in PixiJS.
- [TilingSprite](./scene.TilingSprite.html.md): A TilingSprite is a fast and efficient way to render a repeating texture across a given area.

## text

- [AbstractSplitText](./text.AbstractSplitText.html.md): A container that splits text into individually manipulatable segments (lines, words, and characters) for advanced text effects and animations.
- [BitmapFont](./text.BitmapFont.html.md): A BitmapFont object represents a particular font face, size, and style.
- [BitmapText](./scene.BitmapText.html.md): A BitmapText object creates text using pre-rendered bitmap fonts.
- [HTMLText](./scene.HTMLText.html.md): A HTMLText object creates text using HTML/CSS rendering with SVG foreignObject.
- [HTMLTextStyle](./text.HTMLTextStyle.html.md): A TextStyle object rendered by the HTMLTextSystem.
- [SplitBitmapText](./text.SplitBitmapText.html.md): A container that splits text into individually manipulatable segments (lines, words, and characters) for advanced text effects and animations.
- [SplitText](./text.SplitText.html.md): A container that splits text into individually manipulatable segments (lines, words, and characters) for advanced text effects and animations.
- [Text](./scene.Text.html.md): A powerful text rendering class that creates one or multiple lines of text using the Canvas API.
- [TextStyle](./text.TextStyle.html.md): A TextStyle Object contains information to decorate Text objects.

## gif

- [Overview](./gif.html.md): Learn how to load, display, and control animated GIFs in PixiJS using GifSource and GifSprite.
- [GifSprite](./gif.GifSprite.html.md): Runtime object for playing animated GIFs with advanced playback control.

## ticker

- [Overview](./ticker.html.md): Use the Ticker class in PixiJS to run game loops, animations, and time-based updates with priority control and FPS limiting.
- [Ticker](./ticker.Ticker.html.md): A Ticker class that runs an update loop that other objects listen to.

## utils

- [Overview](./utils.html.md): Learn about PixiJS utility functions for browser detection, device capabilities, data manipulation, and canvas operations.
- [Transform](./utils.Transform.html.md): The Transform class facilitates the manipulation of a 2D transformation matrix through user-friendly properties: position, scale, rotation, skew, and pivot.
- [isMobile](./utils.isMobile.html.md): Detects whether the device is mobile and what type of mobile device it is.
- [path](./utils.path.html.md): Path utilities for working with URLs and file paths in a cross-platform way.
- [isWebGLSupported](./utils.isWebGLSupported.html.md): Helper for checking for WebGL support in the current environment.
- [isWebGPUSupported](./utils.isWebGPUSupported.html.md): Helper for checking for WebGPU support in the current environment.

## migrations

- [v8 Migration Guide](./migrations.html.md): PixiJS v8 Migration Guide - Transitioning from PixiJS v7 to v8
- [v7 Migration Guide](./migrations-1.html.md): PixiJS v7 Migration Guide - Transitioning from v6 to v7
- [v6 Migration Guide](./migrations-2.html.md): PixiJS v6 Migration Guide - Transitioning from PixiJS v5 to v6
- [v5 Migration Guide](./migrations-3.html.md): PixiJS v5 Migration Guide - Transitioning from PixiJS v4 to v5

## Optional

- [BackgroundLoader](./assets.BackgroundLoader.html.md): The BackgroundLoader handles loading assets passively in the background to prepare them for future use.
- [Cache](./assets.Cache.html.md): A global cache for all assets in your PixiJS application.
- [Loader](./assets.Loader.html.md): The Loader is responsible for loading all assets, such as images, spritesheets, audio files, etc.
- [Resolver](./assets.Resolver.html.md): A class that is responsible for resolving mapping asset URLs to keys.
- [basisTranscoderUrls](./assets.basisTranscoderUrls.html.md): The urls for the Basis transcoder files.
- [ktxTranscoderUrls](./assets.ktxTranscoderUrls.html.md): The urls for the KTX transcoder library.
- [loadBasis](./assets.loadBasis.html.md): Loads Basis textures using a web worker.
- [loadBitmapFont](./assets.loadBitmapFont.html.md): Loader plugin for loading bitmap fonts.
- [loadDDS](./assets.loadDDS.html.md): Loads DDS textures.
- [loadJson](./assets.loadJson.html.md): A simple loader plugin for loading json data
- [loadKTX](./assets.loadKTX.html.md): Loads KTX textures.
- [loadKTX2](./assets.loadKTX2.html.md): Loader parser for KTX2 textures.
- [loadSvg](./assets.loadSvg.html.md): A loader plugin for loading SVG data as textures or graphics contexts.
- [loadTextures](./assets.loadTextures.html.md): A simple plugin to load our textures! This makes use of imageBitmaps where available.
- [loadTxt](./assets.loadTxt.html.md): A simple loader plugin for loading text data
- [loadVideoTextures](./assets.loadVideoTextures.html.md): A simple plugin to load video textures.
- [loadWebFont](./assets.loadWebFont.html.md): A loader plugin for handling web fonts
- [spritesheetAsset](./assets.spritesheetAsset.html.md): Asset extension for loading spritesheets
- [WorkerManager](./assets.WorkerManager.html.md): Manages a pool of web workers for loading ImageBitmap objects asynchronously.
- [crossOrigin](./assets.crossOrigin.html.md): Set cross origin based detecting the url and the crossorigin
- [setBasisTranscoderPath](./assets.setBasisTranscoderPath.html.md): Sets the Basis transcoder paths.
- [setKTXTranscoderPath](./assets.setKTXTranscoderPath.html.md): Sets the paths for the KTX transcoder library.
- [BrowserAdapter](./environment.BrowserAdapter.html.md): This is an implementation of the {@link Adapter} interface.
- [DOMAdapter](./environment.DOMAdapter.html.md): The DOMAdapter is a singleton that allows PixiJS to perform DOM operations, such as creating a canvas.
- [WebWorkerAdapter](./environment.WebWorkerAdapter.html.md): This is an implementation of the {@link Adapter} interface.
- [autoDetectEnvironment](./environment.autoDetectEnvironment.html.md)
- [loadEnvironmentExtensions](./environment.loadEnvironmentExtensions.html.md): Automatically detects the environment and loads the appropriate extensions.
- [EventBoundary](./events.EventBoundary.html.md): Event boundaries are "barriers" where events coming from an upstream scene are modified before downstream propagation.
- [EventsTicker](./events.EventsTicker.html.md): This class handles automatic firing of PointerEvents in the case where the pointer is stationary for too long.
- [BlurFilterPass](./filters.BlurFilterPass.html.md): The BlurFilterPass applies a horizontal or vertical Gaussian blur to an object.
- [Filter](./filters.Filter.html.md): The Filter class is the base for all filter effects used in Pixi.js As it extends a shader, it requires that a glProgram is parsed in to work with WebGL and a gpuProgram for WebGPU.
- [groupD8](./maths.groupD8.html.md): Implements the dihedral group D8, which is similar to [group D4]{@link http://mathworld.wolfram.com/DihedralGroupD4.html}; D8 is the same but with diagonals, and it is used for texture rotations.
- [floatEqual](./maths.floatEqual.html.md): The idea of a relative epsilon comparison is to find the difference between the two numbers, and see if it is less than a given epsilon.
- [isPow2](./maths.isPow2.html.md): Checks if a number is a power of two.
- [lineIntersection](./maths.lineIntersection.html.md): Computes the point where non-coincident and non-parallel Lines intersect.
- [log2](./maths.log2.html.md): Computes ceil of log base 2 log2
- [nextPow2](./maths.nextPow2.html.md): Rounds to next power of two.
- [segmentIntersection](./maths.segmentIntersection.html.md): Computes the point where non-coincident and non-parallel segments intersect.
- [AbstractRenderer](./rendering.AbstractRenderer.html.md): The base class for a PixiJS Renderer.
- [AbstractTextSystem](./rendering.AbstractTextSystem.html.md): Base system plugin to the renderer to manage canvas text.
- [AlphaMask](./rendering.AlphaMask.html.md): AlphaMask is an effect that applies a mask to a container using the alpha channel of a sprite.
- [BackgroundSystem](./rendering.BackgroundSystem.html.md): The background system manages the background color and alpha of the main view.
- [Batch](./rendering.Batch.html.md): A batch pool is used to store batches when they are not currently in use.
- [Batcher](./rendering.Batcher.html.md): A batcher is used to batch together objects with the same texture.
- [BatcherPipe](./rendering.BatcherPipe.html.md): A pipe that batches elements into batches and sends them to the renderer.
- [BatchGeometry](./rendering.BatchGeometry.html.md): This class represents a geometry used for batching in the rendering system.
- [BatchTextureArray](./rendering.BatchTextureArray.html.md): Used by the batcher to build texture batches.
- [BindGroup](./rendering.BindGroup.html.md): A bind group is a collection of resources that are bound together for use by a shader.
- [BindGroupSystem](./rendering.BindGroupSystem.html.md): This manages the WebGPU bind groups.
- [Buffer](./rendering.Buffer.html.md): A wrapper for a WebGPU/WebGL Buffer.
- [BufferImageSource](./rendering.BufferImageSource.html.md): A texture source that uses a TypedArray or ArrayBuffer as its resource.
- [BufferResource](./rendering.BufferResource.html.md): A resource that can be bound to a bind group and used in a shader.
- [CanvasContextSystem](./rendering.CanvasContextSystem.html.md): Canvas 2D context system for the CanvasRenderer.
- [CanvasFilterSystem](./rendering.CanvasFilterSystem.html.md): Canvas2D filter system that applies compatible filters using CSS filter strings.
- [CanvasGraphicsContextSystem](./rendering.CanvasGraphicsContextSystem.html.md): A system that manages the rendering of GraphicsContexts for Canvas2D.
- [CanvasLimitsSystem](./rendering.CanvasLimitsSystem.html.md): Basic limits for CanvasRenderer.
- [CanvasRendererTextSystem](./rendering.CanvasRendererTextSystem.html.md): System plugin to the renderer to manage canvas text for Canvas2D.
- [CanvasRenderTargetAdaptor](./rendering.CanvasRenderTargetAdaptor.html.md): Canvas adaptor for render targets.
- [CanvasRenderTargetSystem](./rendering.CanvasRenderTargetSystem.html.md): The Canvas adaptor for the render target system.
- [CanvasSource](./rendering.CanvasSource.html.md): A texture source that uses a canvas as its resource.
- [CanvasTextSystem](./rendering.CanvasTextSystem.html.md): System plugin to the renderer to manage canvas text for GPU renderers.
- [CanvasTextureSystem](./rendering.CanvasTextureSystem.html.md): Texture helper system for CanvasRenderer.
- [ColorMask](./rendering.ColorMask.html.md): The ColorMask effect allows you to apply a color mask to the rendering process.
- [CompressedSource](./rendering.CompressedSource.html.md): A texture source that uses a compressed resource, such as an array of Uint8Arrays.
- [CubeTexture](./rendering.CubeTexture.html.md): A cube texture that can be bound to shaders (samplerCube / texture_cube).
- [CubeTextureSource](./rendering.CubeTextureSource.html.md): A {@link TextureSource} that represents a cube texture (6 faces).
- [DefaultBatcher](./rendering.DefaultBatcher.html.md): The default batcher is used to batch quads and meshes.
- [DefaultShader](./rendering.DefaultShader.html.md): DefaultShader is a specialized shader class designed for batch rendering.
- [ExternalSource](./rendering.ExternalSource.html.md): A texture source that uses a GPU texture from an external library (e.g., Three.js).
- [FilterSystem](./rendering.FilterSystem.html.md): System that manages the filter pipeline
- [GCSystem](./rendering.GCSystem.html.md): A unified garbage collection system for managing GPU resources.
- [Geometry](./rendering.Geometry.html.md): A Geometry is a low-level object that represents the structure of 2D shapes in terms of vertices and attributes.
- [GlBackBufferSystem](./rendering.GlBackBufferSystem.html.md): For blend modes you need to know what pixels you are actually drawing to.
- [GlBufferSystem](./rendering.GlBufferSystem.html.md): System plugin to the renderer to manage buffers.
- [GlColorMaskSystem](./rendering.GlColorMaskSystem.html.md): The system that handles color masking for the WebGL.
- [GlContextSystem](./rendering.GlContextSystem.html.md): System plugin to the renderer to manage the context
- [GlEncoderSystem](./rendering.GlEncoderSystem.html.md): The system that handles encoding commands for the WebGL.
- [GlGeometrySystem](./rendering.GlGeometrySystem.html.md): System plugin to the renderer to manage geometry.
- [GlLimitsSystem](./rendering.GlLimitsSystem.html.md): The GpuLimitsSystem provides information about the capabilities and limitations of the underlying GPU.
- [GlobalUniformSystem](./rendering.GlobalUniformSystem.html.md): System plugin to the renderer to manage global uniforms for the renderer.
- [GlProgram](./rendering.GlProgram.html.md): A wrapper for a WebGL Program.
- [GlRenderTargetSystem](./rendering.GlRenderTargetSystem.html.md): The WebGL adaptor for the render target system.
- [GlShaderSystem](./rendering.GlShaderSystem.html.md): System plugin to the renderer to manage the shaders for WebGL.
- [GlStateSystem](./rendering.GlStateSystem.html.md): System plugin to the renderer to manage WebGL state machines
- [GlStencilSystem](./rendering.GlStencilSystem.html.md): This manages the stencil buffer.
- [GlTextureSystem](./rendering.GlTextureSystem.html.md): The system for managing textures in WebGL.
- [GlUboSystem](./rendering.GlUboSystem.html.md): System plugin to the renderer to manage uniform buffers.
- [GlUniformGroupSystem](./rendering.GlUniformGroupSystem.html.md): System plugin to the renderer to manage shaders.
- [GpuBufferSystem](./rendering.GpuBufferSystem.html.md): System plugin to the renderer to manage buffers.
- [GpuColorMaskSystem](./rendering.GpuColorMaskSystem.html.md): The system that handles color masking for the GPU.
- [GpuDeviceSystem](./rendering.GpuDeviceSystem.html.md): System plugin to the renderer to manage the context.
- [GpuEncoderSystem](./rendering.GpuEncoderSystem.html.md): The system that handles encoding commands for the GPU.
- [GpuLimitsSystem](./rendering.GpuLimitsSystem.html.md): The GpuLimitsSystem provides information about the capabilities and limitations of the underlying GPU.
- [GpuProgram](./rendering.GpuProgram.html.md): A wrapper for a WebGPU Program, specifically designed for the WebGPU renderer.
- [GpuRenderTargetSystem](./rendering.GpuRenderTargetSystem.html.md): The WebGL adaptor for the render target system.
- [GpuShaderSystem](./rendering.GpuShaderSystem.html.md): A system that manages the rendering of GpuPrograms.
- [GpuStateSystem](./rendering.GpuStateSystem.html.md): System plugin to the renderer to manage WebGL state machines.
- [GpuStencilSystem](./rendering.GpuStencilSystem.html.md): This manages the stencil buffer.
- [GpuTextureSystem](./rendering.GpuTextureSystem.html.md): The system that handles textures for the GPU.
- [GpuUboSystem](./rendering.GpuUboSystem.html.md): System plugin to the renderer to manage uniform buffers.
- [GraphicsContextSystem](./rendering.GraphicsContextSystem.html.md): A system that manages the rendering of GraphicsContexts.
- [HelloSystem](./rendering.HelloSystem.html.md): A simple system responsible for initiating the renderer.
- [HTMLTextSystem](./rendering.HTMLTextSystem.html.md): System plugin to the renderer to manage HTMLText
- [ImageSource](./rendering.ImageSource.html.md): A texture source that uses an image-like resource as its resource.
- [InstructionSet](./rendering.InstructionSet.html.md): A set of instructions that can be executed by the renderer.
- [MaskEffectManager](./rendering.MaskEffectManager.html.md): A class that manages the conversion of masks to mask effects.
- [PipelineSystem](./rendering.PipelineSystem.html.md): A system that creates and manages the GPU pipelines.
- [PrepareBase](./rendering.PrepareBase.html.md): Part of the prepare system.
- [PrepareQueue](./rendering.PrepareQueue.html.md): Part of the prepare system.
- [PrepareSystem](./rendering.PrepareSystem.html.md): The prepare system provides renderer-specific plugins for pre-rendering DisplayObjects.
- [PrepareUpload](./rendering.PrepareUpload.html.md): Part of the prepare system.
- [RenderableGCSystem](./rendering.RenderableGCSystem.html.md): The RenderableGCSystem is responsible for cleaning up GPU resources that are no longer being used.
- [RenderGroup](./rendering.RenderGroup.html.md): A RenderGroup is a class that is responsible for I generating a set of instructions that are used to render the root container and its children.
- [RenderTarget](./rendering.RenderTarget.html.md): A class that describes what the renderers are rendering to.
- [RenderTargetSystem](./rendering.RenderTargetSystem.html.md): A system that manages render targets.
- [RenderTexture](./rendering.RenderTexture.html.md): A render texture, extends `Texture`.
- [SchedulerSystem](./rendering.SchedulerSystem.html.md): The SchedulerSystem manages scheduled tasks with specific intervals.
- [ScissorMask](./rendering.ScissorMask.html.md): ScissorMask is an effect that applies a scissor mask to a container.
- [Shader](./rendering.Shader.html.md): The Shader class is an integral part of the PixiJS graphics pipeline.
- [State](./rendering.State.html.md): This is a WebGL state, and is is passed to {@link GlStateSystem}.
- [StencilMask](./rendering.StencilMask.html.md): A mask that uses the stencil buffer to clip the rendering of a container.
- [TextureGCSystem](./rendering.TextureGCSystem.html.md): System plugin to the renderer to manage texture garbage collection on the GPU, ensuring that it does not get clogged up with textures that are no longer being used.
- [TextureMatrix](./rendering.TextureMatrix.html.md): Class controls uv mapping from Texture normal space to BaseTexture normal space.
- [TexturePoolClass](./rendering.TexturePoolClass.html.md): Texture pool, used by FilterSystem and plugins.
- [TextureSource](./rendering.TextureSource.html.md): A TextureSource stores the information that represents an image.
- [TextureStyle](./rendering.TextureStyle.html.md): A texture style describes how a texture should be sampled by a shader.
- [UboSystem](./rendering.UboSystem.html.md): System plugin to the renderer to manage uniform buffers.
- [UniformGroup](./rendering.UniformGroup.html.md): Uniform group holds uniform map and some ID's for work `UniformGroup` has two modes: 1: Normal mode Normal mode will upload the uniforms with individual function calls as required.
- [VideoSource](./rendering.VideoSource.html.md): A texture source that uses a video as its resource.
- [ViewSystem](./rendering.ViewSystem.html.md): The view system manages the main canvas that is attached to the DOM.
- [BLEND_TO_NPM](./rendering.BLEND_TO_NPM.html.md): The map of blend modes supported by Pixi
- [DRAW_MODES](./rendering.DRAW_MODES.html.md)
- [SCALE_MODES](./rendering.SCALE_MODES.html.md): The scale modes that are supported by pixi.
- [TexturePool](./rendering.TexturePool.html.md): The default texture pool instance.
- [WRAP_MODES](./rendering.WRAP_MODES.html.md): The wrap modes that are supported by pixi.
- [fastCopy](./rendering.fastCopy.html.md): Copies from one ArrayBuffer to another.
- [GraphicsPath](./scene.GraphicsPath.html.md): The `GraphicsPath` class is designed to represent a graphical path consisting of multiple drawing instructions.
- [Mesh](./scene.Mesh.html.md): Base mesh class.
- [MeshGeometry](./scene.MeshGeometry.html.md): A geometry used to batch multiple meshes with the same texture.
- [MeshSimple](./scene.MeshSimple.html.md): A simplified mesh class that provides an easy way to create and manipulate textured meshes with direct vertex control.
- [NineSliceGeometry](./scene.NineSliceGeometry.html.md): The NineSliceGeometry class allows you to create a NineSlicePlane object.
- [PerspectivePlaneGeometry](./scene.PerspectivePlaneGeometry.html.md): A PerspectivePlaneGeometry allows you to draw a 2d plane with perspective.
- [PlaneGeometry](./scene.PlaneGeometry.html.md): The PlaneGeometry allows you to draw a 2d plane
- [RenderContainer](./scene.RenderContainer.html.md): A container that allows for custom rendering logic.
- [RopeGeometry](./scene.RopeGeometry.html.md): RopeGeometry allows you to draw a geometry across several points and then manipulate these points.
- [ShapePath](./scene.ShapePath.html.md): The `ShapePath` class acts as a bridge between high-level drawing commands and the lower-level `GraphicsContext` rendering engine.
- [ViewContainer](./scene.ViewContainer.html.md): A ViewContainer is a type of container that represents a view.
- [shapeBuilders](./scene.shapeBuilders.html.md): A record of shape builders, keyed by shape type.
- [styleAttributes](./scene.styleAttributes.html.md): A map of SVG style attributes and their default values.
- [buildGeometryFromPath](./scene.buildGeometryFromPath.html.md): When building a mesh, it helps to leverage the simple API we have in `GraphicsPath` as it can often be easier to define the geometry in a more human-readable way.
- [AbstractBitmapFont](./text.AbstractBitmapFont.html.md): An abstract representation of a bitmap font.
- [AbstractText](./scene.AbstractText.html.md): An abstract Text class, used by all text type in Pixi.
- [BitmapFontManager](./text.BitmapFontManager.html.md): The BitmapFontManager is a helper that exists to install and uninstall fonts into the cache for BitmapText objects.
- [CanvasTextMetrics](./text.CanvasTextMetrics.html.md): The TextMetrics object represents the measurement of a block of text with a specified style.
- [GifSource](./gif.GifSource.html.md): Resource provided to GifSprite instances.
- [GifAsset](./gif.GifAsset.html.md): Handle the loading of GIF images.
- [Pool](./utils.Pool.html.md): A generic class for managing a pool of items.
- [PoolGroupClass](./utils.PoolGroupClass.html.md): A group of pools that can be used to store objects of different types.
- [ViewableBuffer](./utils.ViewableBuffer.html.md): Flexible wrapper around `ArrayBuffer` that also provides typed array views on demand.
- [DATA_URI](./utils.DATA_URI.html.md): Regexp for data URI.
- [earcut](./utils.earcut.html.md): A polygon triangulation library
- [formatShader](./utils.formatShader.html.md): formats a shader so its more pleasant to read
- [sayHello](./utils.sayHello.html.md): Prints out the version and renderer information for this running instance of PixiJS.