// panorama-to-cubemap.js
// Convert an equirectangular panorama to 6 cubemap faces
// panorama: HTMLImageElement
// faceSize: number of pixels per cube face
// mirror: boolean, optional, flip horizontally
// onProgress: callback(progress 0-1), optional

export async function panoramaToCubemap({ panorama, faceSize = 1024, mirror = false, onProgress }) {
    const canvas = document.createElement('canvas');
    canvas.width = panorama.width;
    canvas.height = panorama.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(panorama, 0, 0);
    const panoData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const faces = {};
    const faceNames = ['right','left','front','back','top','bottom'];

    // directions for each cube face (center vectors)
    const directions = {
        right:  [ 1, 0, 0],
        left:   [-1, 0, 0],
        top:    [0, 1, 0],
        bottom: [0,-1, 0],
        front:  [0, 0, 1],
        back:   [0, 0,-1]
    };

    function samplePanorama(lon, lat) {
        // lon [-π, π], lat [-π/2, π/2]
        let u = (lon / (2*Math.PI)) + 0.5;
        let v = 0.5 - (lat / Math.PI);
        if (!mirror) u = 1 - u;
        u = Math.min(panorama.width-1, Math.max(0, u*(panorama.width-1)));
        v = Math.min(panorama.height-1, Math.max(0, v*(panorama.height-1)));

        const x0 = Math.floor(u), x1 = Math.min(panorama.width-1, x0+1);
        const y0 = Math.floor(v), y1 = Math.min(panorama.height-1, y0+1);
        const dx = u - x0, dy = v - y0;

        const idx = (x,y)=> (y*panorama.width + x)*4;
        const c00 = panoData.data.slice(idx(x0,y0), idx(x0,y0)+4);
        const c10 = panoData.data.slice(idx(x1,y0), idx(x1,y0)+4);
        const c01 = panoData.data.slice(idx(x0,y1), idx(x0,y1)+4);
        const c11 = panoData.data.slice(idx(x1,y1), idx(x1,y1)+4);

        const color = [0,0,0,255];
        for(let i=0;i<3;i++){
            const c0 = c00[i]*(1-dx)+c10[i]*dx;
            const c1 = c01[i]*(1-dx)+c11[i]*dx;
            color[i] = c0*(1-dy)+c1*dy;
        }
        return color;
    }

    for (const faceName of faceNames) {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = faceSize;
        outCanvas.height = faceSize;
        const outCtx = outCanvas.getContext('2d');
        const outImg = outCtx.createImageData(faceSize, faceSize);

        const center = directions[faceName];

        for (let y = 0; y < faceSize; y++) {
            const v = (2*(y+0.5)/faceSize)-1; // [-1,1]
            for (let x = 0; x < faceSize; x++) {
                const u = (2*(x+0.5)/faceSize)-1; // [-1,1]

                let dx, dy, dz;

                switch(faceName) {
                    case 'right':   dx=1; dy=-v; dz=-u; break;
                    case 'left':    dx=-1; dy=-v; dz=u; break;
                    case 'front':   dx=u; dy=-v; dz=1; break;
                    case 'back':    dx=-u; dy=-v; dz=-1; break;
                    case 'top':     dx=u; dy=1; dz=v; break;
                    case 'bottom':  dx=u; dy=-1; dz=-v; break;
                }

                const len = Math.hypot(dx, dy, dz);
                dx/=len; dy/=len; dz/=len;


				const lat = Math.asin(dy);
				let lon = Math.atan2(dz, dx) + Math.PI; // rotate 180° yaw
				if (lon > Math.PI) lon -= 2 * Math.PI;
                // const lat = Math.asin(dy);
                // const lon = Math.atan2(dz, dx);

                const color = samplePanorama(lon, lat);
                const idx = (y*faceSize+x)*4;
                outImg.data[idx] = color[0];
                outImg.data[idx+1] = color[1];
                outImg.data[idx+2] = color[2];
                outImg.data[idx+3] = 255;
            }

            if(onProgress && y%16===0) {
                onProgress(faceNames.indexOf(faceName)/faceNames.length + y/(faceSize*faceNames.length));
                await new Promise(r=>setTimeout(r,0));
            }
        }

        outCtx.putImageData(outImg,0,0);
        faces[faceName] = outCanvas;
    }

	ctx.save();
	ctx.translate(faceSize, 0);
	ctx.scale(-1, 1);
	ctx.drawImage(canvas, 0, 0);
	ctx.restore();

    if(onProgress) onProgress(1);
    return faces;
}