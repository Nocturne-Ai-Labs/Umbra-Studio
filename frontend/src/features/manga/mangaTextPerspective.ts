import type { UmbraCanvasRect } from '../canvas/canvasModel';

export interface MangaTextPoint { x: number; y: number }
export interface MangaTextTriangle { source: MangaTextPoint[]; target: MangaTextPoint[]; matrix: number[] }

export function projectMangaTextPoint(point: MangaTextPoint, width: number, height: number, tiltX: number, tiltY: number, distance = Math.max(width,height) * 2): MangaTextPoint {
  const x = point.x - width / 2, y = point.y - height / 2;
  const a = tiltX * Math.PI / 180, b = tiltY * Math.PI / 180;
  const rotatedX = x * Math.cos(b) + y * Math.sin(a) * Math.sin(b);
  const rotatedY = y * Math.cos(a);
  const depth = -x * Math.sin(b) + y * Math.sin(a) * Math.cos(b);
  const perspective = distance / (distance - depth);
  return {x:width / 2 + rotatedX * perspective,y:height / 2 + rotatedY * perspective};
}

function triangleMatrix(source: MangaTextPoint[], target: MangaTextPoint[]): number[] {
  const [p,q,r] = source, [u,v,w] = target;
  const dx1=q.x-p.x,dy1=q.y-p.y,dx2=r.x-p.x,dy2=r.y-p.y,det=dx1*dy2-dx2*dy1;
  const a=((v.x-u.x)*dy2-(w.x-u.x)*dy1)/det, c=(dx1*(w.x-u.x)-dx2*(v.x-u.x))/det;
  const b=((v.y-u.y)*dy2-(w.y-u.y)*dy1)/det, d=(dx1*(w.y-u.y)-dx2*(v.y-u.y))/det;
  return [a,b,c,d,u.x-a*p.x-c*p.y,u.y-b*p.x-d*p.y];
}

export function mangaTextMesh(bounds: UmbraCanvasRect, width: number, height: number, tiltX: number, tiltY: number): MangaTextTriangle[] {
  if (!tiltX && !tiltY) return [];
  const columns=12,rows=6,distance=Math.max(width,height,bounds.width,bounds.height,Math.abs(bounds.x-width/2),Math.abs(bounds.y-height/2),Math.abs(bounds.x+bounds.width-width/2),Math.abs(bounds.y+bounds.height-height/2))*3;
  const triangles: MangaTextTriangle[]=[];
  const at=(x:number,y:number)=>({x:bounds.x+bounds.width*x/columns,y:bounds.y+bounds.height*y/rows});
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    const a=at(column,row),b=at(column+1,row),c=at(column+1,row+1),d=at(column,row+1);
    for(const source of [[a,b,c],[a,c,d]]) {
      const target=source.map(point=>projectMangaTextPoint(point,width,height,tiltX,tiltY,distance));
      triangles.push({source,target,matrix:triangleMatrix(source,target)});
    }
  }
  return triangles;
}

export const mangaTrianglePath = (triangle: MangaTextTriangle) => triangle.target.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ')+' Z';
