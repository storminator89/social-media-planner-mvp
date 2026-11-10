// Pointer math is in the already rotated/flipped visual crop space.
const finite=(...values)=>values.every(Number.isFinite);
const percent=value=>Math.round(Math.min(100,Math.max(0,value))*10)/10;
export function validCanvasRect(rect){return !!rect&&finite(rect.left,rect.top,rect.width,rect.height)&&rect.width>0&&rect.height>0;}
export function canvasPoint(rect,width,height,clientX,clientY){
 if(!validCanvasRect(rect)||!finite(width,height,clientX,clientY)||width<=0||height<=0)return null;
 const x=(clientX-rect.left)*width/rect.width,y=(clientY-rect.top)*height/rect.height;
 return x>=0&&y>=0&&x<=width&&y<=height?{x,y}:null;
}
export function cropOverflow(g){
 if(!g||!finite(g.w,g.h,g.sw,g.sh)||Math.min(g.w,g.h,g.sw,g.sh)<=0)return null;
 const tolerance=Math.max(1,g.w,g.h)*1e-10,x=g.w-g.sw,y=g.h-g.sh;
 if(x< -tolerance||y< -tolerance)return null;
 // Ratio division can leave subpixel roundoff in an otherwise uncropped Original.
 return {x:x>tolerance?x:0,y:y>tolerance?y:0};
}
export function cropDragPosition(g,rect,start,dx,dy){
 const overflow=cropOverflow(g);
 if(!overflow||!start||!validCanvasRect(rect)||!finite(start.x,start.y,dx,dy)||start.x<0||start.x>100||start.y<0||start.y>100)return null;
 // Dragging the image right moves the source crop left. No second rotation/flip.
 return {x:overflow.x?percent(start.x-dx/rect.width*g.sw/overflow.x*100):start.x,y:overflow.y?percent(start.y-dy/rect.height*g.sh/overflow.y*100):start.y};
}
export function textOverlayContainsPoint(layout,point,measureText){
 if(!layout||!point)return false;
 const contains=box=>point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+box.height;
 if(layout.background)return contains(layout.box);
 return layout.lines.some((line,index)=>{
  if(!line.trim())return false;
  const metrics=measureText(line),top=layout.box.y+layout.padding+index*layout.lineHeight;
  // Native TextMetrics refer to the same font, alignment and top baseline as paint.
  if(finite(metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight,metrics.actualBoundingBoxAscent,metrics.actualBoundingBoxDescent))return contains({x:layout.x-metrics.actualBoundingBoxLeft,y:top-metrics.actualBoundingBoxAscent,width:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,height:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent});
  const width=metrics.width,x=layout.align==='left'?layout.x:layout.align==='right'?layout.x-width:layout.x-width/2;
  return contains({x,y:top,width,height:layout.fontSize});
 });
}
