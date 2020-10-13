const IMG_DIM = 512;
const resizer = new OffscreenCanvas(IMG_DIM, IMG_DIM);
const ctx = resizer.getContext("2d");

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

onmessage = evt => {
    /** @type {{data:{skins:string[]}}} */
    const { data } = evt;
    if (!data) return;
    const { skins } = data;
    if (!skins || !Array.isArray(skins) || !skins.length) return;

    /** @type {{url:string, buffer:ImageBitmap}[]} */
    const loaded = [];
    Promise.all(skins.map(url => new Promise(async resolve => {
        try {
            const res = await fetch(url);
            const buf = await res.blob();
            const map = await createImageBitmap(buf);

            // I wonder what was here...
            if (url.startsWith("")) {
                ctx.drawImage(map, -2, -2, IMG_DIM + 4, IMG_DIM + 4);
                map.close();
                loaded.push({ url, buffer: resizer.transferToImageBitmap() });
            } else if (map.height != IMG_DIM || map.width != IMG_DIM) {
                ctx.drawImage(map, 0, 0, IMG_DIM, IMG_DIM);
                map.close();
                loaded.push({ url, buffer: resizer.transferToImageBitmap() });
            } else loaded.push({ url, buffer: map });
        } catch (e) { console.error(e); } finally { resolve(); }
    }))).then(() => postMessage({ skins: loaded }, loaded.map(s => s.buffer)));
};