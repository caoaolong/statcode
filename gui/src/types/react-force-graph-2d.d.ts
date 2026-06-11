declare module "react-force-graph-2d" {
  import { Component } from "react";

  interface GraphData {
    nodes: any[];
    links: any[];
  }

  interface ForceGraphProps {
    graphData: GraphData;
    width?: number;
    height?: number;
    backgroundColor?: string;
    nodeLabel?: string | ((node: any) => string);
    nodeColor?: string | ((node: any) => string);
    nodeVal?: number | ((node: any) => number);
    nodeRelSize?: number;
    nodeCanvasObject?: (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    nodePointerAreaPaint?: (node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    linkLabel?: string | ((link: any) => string);
    linkColor?: string | ((link: any) => string);
    linkWidth?: number | ((link: any) => number);
    linkDirectionalArrowLength?: number;
    linkDirectionalArrowRelPos?: number;
    linkCurvature?: number | ((link: any) => number);
    linkCanvasObject?: (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    linkCanvasObjectMode?: string | ((link: any) => string);
    onNodeClick?: (node: any, event: MouseEvent) => void;
    onNodeHover?: (node: any | null, previousNode: any | null) => void;
    onLinkHover?: (link: any | null, previousLink: any | null) => void;
    onBackgroundClick?: (event: MouseEvent) => void;
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    d3AlphaDecay?: number;
    d3VelocityDecay?: number;
    cooldownTime?: number;
    warmupTicks?: number;
    enableNodeDrag?: boolean;
    enableZoomPanInteraction?: boolean;
    dagMode?: string;
    dagLevelDistance?: number;
    d3Force?: string | { charge?: any; link?: any; center?: any } | ((node: any) => void);
    ref?: any;
  }

  export default class ForceGraph2D extends Component<ForceGraphProps> {
    zoom(zoom: number, duration?: number): void;
    centerAt(x?: number, y?: number, duration?: number): void;
    zoomToFit(duration?: number, padding?: number): void;
  }
}
