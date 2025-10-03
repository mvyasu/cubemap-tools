// cubemap-to-panorama.js
// Convert 6 cubemap faces into an equirectangular panorama
// faces = { front, back, left, right, top, bottom }

function rotateY(vec, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = vec[0], y = vec[1], z = vec[2];
    return [
        cos * x + sin * z,
        y,
        -sin * x + cos * z
    ];
}

export async function cubemapToEquirectangular({ faces, width = 2048, height = 1024, mirror = false, onProgress }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const outImg = ctx.createImageData(width, height);

    // Prepare offscreen canvases for each face
    const faceCanvases = {};
    for (const [key, img] of Object.entries(faces)) {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const cctx = c.getContext('2d');
        cctx.drawImage(img, 0, 0);
        faceCanvases[key] = { canvas: c, ctx: cctx, data: cctx.getImageData(0, 0, c.width, c.height) };
    }

    function sampleFace(face, u, v) {
		const fc = faceCanvases[face];
		const w = fc.canvas.width;
		const h = fc.canvas.height;

		// map [-1,1] → [0, width/height - 1]
		const fx = (u * 0.5 + 0.5) * (w - 1);
		const fy = (v * 0.5 + 0.5) * (h - 1);

		const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1);
		const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1);

		const dx = fx - x0;
		const dy = fy - y0;

		const idx = (x, y) => (y * w + x) * 4;

		const c00 = fc.data.data.slice(idx(x0, y0), idx(x0, y0) + 4);
		const c10 = fc.data.data.slice(idx(x1, y0), idx(x1, y0) + 4);
		const c01 = fc.data.data.slice(idx(x0, y1), idx(x0, y1) + 4);
		const c11 = fc.data.data.slice(idx(x1, y1), idx(x1, y1) + 4);

		const color = [0, 0, 0, 255];
		for (let i = 0; i < 3; i++) { // R,G,B
			const c0 = c00[i] * (1 - dx) + c10[i] * dx;
			const c1 = c01[i] * (1 - dx) + c11[i] * dx;
			color[i] = c0 * (1 - dy) + c1 * dy;
		}

		return color;
	}

    for (let y = 0; y < height; y++) {
        const v = y / height;
        const lat = (0.5 - v) * Math.PI; // [-pi/2, pi/2]

        for (let x = 0; x < width; x++) {
            const u = x / width;
            const lon = (u - 0.5) * 2 * Math.PI;

			// Original direction
			let dx = Math.cos(lat) * Math.cos(lon);
			let dy = Math.sin(lat);
			let dz = Math.cos(lat) * Math.sin(lon);

			// Rotate 90° CCW around Y-axis
			[dx, dy, dz] = rotateY([dx, dy, dz], Math.PI*2);

            const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
            let face, fu, fv;

            if (ax >= ay && ax >= az) {
                if (dx > 0) { face = 'right'; fu = -dz / ax; fv = -dy / ax; }
                else        { face = 'left';  fu = dz / ax; fv = -dy / ax; }
            } else if (ay >= ax && ay >= az) {
                if (dy > 0) { // Top face (+Y)
                    face = 'top';
                    fu = -dx / ay; // 180° rotation
                    fv = -dz / ay;
                } else {        // Bottom face (-Y)
                    face = 'bottom';
                    fu = -dx / ay; // 180° rotation
                    fv = dz / ay;
                }
            } else {
                if (dz > 0) { face = 'front';  fu = dx / az; fv = -dy / az; }
                else        { face = 'back';   fu = -dx / az; fv = -dy / az; }
            }

            const color = sampleFace(face, fu, fv);
            const idx = (y * width + x) * 4;
            outImg.data[idx]     = color[0];
            outImg.data[idx + 1] = color[1];
            outImg.data[idx + 2] = color[2];
            outImg.data[idx + 3] = 255;
        }

        if (onProgress && y % 32 === 0) {
            onProgress(y / height);
            await new Promise(r => setTimeout(r, 0)); // allow UI updates
        }
    }

    ctx.putImageData(outImg, 0, 0);

	//mirror horizontally
	if (!mirror) {
		ctx.save();
		ctx.translate(width, 0);
		ctx.scale(-1, 1);
		ctx.drawImage(canvas, 0, 0);
		ctx.restore();
	}

    if (onProgress) onProgress(1);
    return canvas;
}