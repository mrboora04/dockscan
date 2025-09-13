// Finds the most label-like white area: “large-ish rectangle w/ dark ink density”
const ANALYSIS_WIDTH = 480;

export async function findAndCropLabel(file) {
  const bmp = await createImageBitmap(file);
  const scale = ANALYSIS_WIDTH / bmp.width;
  const h = Math.round(bmp.height * scale);

  const cv = new OffscreenCanvas(ANALYSIS_WIDTH, h);
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, ANALYSIS_WIDTH, h);
  const id = cx.getImageData(0, 0, ANALYSIS_WIDTH, h);

  const binary = new Uint8Array(ANALYSIS_WIDTH*h);
  const d = id.data;
  for (let i=0;i<d.length;i+=4){
    const g = (d[i]+d[i+1]+d[i+2])/3;
    binary[i/4] = g>200 ? 1 : 0; // “white lot”
  }

  const blobs = components(binary, ANALYSIS_WIDTH, h);
  if (!blobs.length) return null;

  const best = blobs
    .map(b => ({...b, score: scoreBlob(b, id)}))
    .sort((a,b)=>b.score-a.score)[0];

  if (!best || best.score < 500) return null;

  const pad = .05; // padding
  return {
    x: Math.max(0, (best.minX/scale) - bmp.width*pad),
    y: Math.max(0, (best.minY/scale) - bmp.height*pad),
    width: Math.min(bmp.width, (best.width/scale) + bmp.width*pad*2),
    height: Math.min(bmp.height, (best.height/scale) + bmp.height*pad*2)
  };
}

function components(map,w,h){
  const seen = new Uint8Array(map.length);
  const res = [];
  for (let i=0;i<map.length;i++){
    if (map[i]!==1 || seen[i]) continue;
    const st=[i]; seen[i]=1;
    const blob={minX:w, minY:h, maxX:0, maxY:0, area:0};
    while(st.length){
      const p=st.pop();
      const x=p%w, y=(p-x)/w;
      blob.minX=Math.min(blob.minX,x); blob.minY=Math.min(blob.minY,y);
      blob.maxX=Math.max(blob.maxX,x); blob.maxY=Math.max(blob.maxY,y);
      blob.area++;
      const nbr=[p-w, p+w, p-1, p+1];
      for(const n of nbr){
        if(n>=0 && n<map.length && map[n]===1 && !seen[n]){ seen[n]=1; st.push(n); }
      }
    }
    blob.width=blob.maxX-blob.minX+1; blob.height=blob.maxY-blob.minY+1;
    res.push(blob);
  }
  return res;
}

function scoreBlob(b, id){
  const ar = b.width/b.height;
  const area = b.area;
  if (ar<0.25 || ar>5.5) return 0;
  if (area<500) return 0;

  let dark=0;
  const w=id.width;
  for(let y=b.minY; y<=b.maxY; y++){
    for(let x=b.minX; x<=b.maxX; x++){
      const k=(y*w+x)*4;
      const g=(id.data[k]+id.data[k+1]+id.data[k+2])/3;
      if (g<165) dark++;
    }
  }
  const density=dark/area;
  if (density<.10 || density>.65) return 0;
  return area*density;
}
