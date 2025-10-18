export async function makeLiveCapture(videoEl, boxEl){
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:"environment"}, width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30}}
  });
  videoEl.srcObject = stream;
  const track = stream.getVideoTracks()[0];

  // attempt continuous focus and keep zoom untouched by default
  const apply = c => track.applyConstraints({advanced:[c]}).catch(()=>{});
  const caps = track.getCapabilities?.() || {};
  if(caps.focusMode?.includes("continuous")) apply({focusMode:"continuous"});

  let currentZoom = caps.zoom ? caps.zoom.min : undefined;
  async function setZoom(z){
    if(!caps.zoom) return;
    const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, z));
    await track.applyConstraints({ advanced:[{ zoom: clamped }] });
    currentZoom = clamped;
  }
  function getZoom(){ return currentZoom; }

  const ic = ("ImageCapture" in window) ? new ImageCapture(track) : null;
  async function grabBitmap(){
    if(ic?.grabFrame) return await ic.grabFrame();
    const c=document.createElement("canvas"); c.width=videoEl.videoWidth; c.height=videoEl.videoHeight;
    c.getContext("2d",{willReadFrequently:true}).drawImage(videoEl,0,0);
    return await createImageBitmap(c);
  }
  async function grabCropCanvas(){
    const bmp = await grabBitmap();
    const vr = videoEl.getBoundingClientRect(), br = boxEl.getBoundingClientRect();
    const sx=((br.left-vr.left)/vr.width)*bmp.width, sy=((br.top-vr.top)/vr.height)*bmp.height;
    const sw=(br.width/vr.width)*bmp.width, sh=(br.height/vr.height)*bmp.height;
    const c=document.createElement("canvas"); c.width=sw|0; c.height=sh|0;
    c.getContext("2d",{willReadFrequently:true}).drawImage(bmp,sx,sy,sw,sh,0,0,c.width,c.height);
    return c;
  }
  return { grabCropCanvas, setZoom, getZoom, caps };
}