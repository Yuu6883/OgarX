const IMG_DIM = 512;
const resizer = new OffscreenCanvas(IMG_DIM, IMG_DIM);
const ctx = resizer.getContext("2d");

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

onmessage = async evt => {
    /** @type {{ data: { id: number, skin: string, name: string }}} */
    const { data } = evt;
    if (!data) return;

    let name_bitmap;

    const name_canvas = new OffscreenCanvas(0, 320);
    const name_ctx = name_canvas.getContext("2d");
    name_ctx.font = "bold 320px Bree Serif";
    name_ctx.fillStyle = "white";
    name_ctx.strokeStyle = "black";
    name_ctx.textAlign = "center";
    name_ctx.lineWidth = 30;
    name_ctx.textBaseline = "middle";

    const m = name_ctx.measureText(data.name);
    
    if (m.width) {
        name_canvas.width = Math.ceil(m.width + 40);
        name_ctx.font = "bold 320px Bree Serif";
        name_ctx.fillStyle = "white";
        name_ctx.strokeStyle = "black";
        name_ctx.textAlign = "center";
        name_ctx.lineWidth = 34;
        name_ctx.textBaseline = "middle";
        name_ctx.clearRect(0, 0, name_canvas.width, name_canvas.height);
        name_ctx.strokeText(data.name, name_canvas.width >> 1, name_canvas.height >> 1);
        name_ctx.fillText(data.name, name_canvas.width >> 1, name_canvas.height >> 1);
        name_bitmap = name_canvas.transferToImageBitmap();
    }

    try {
        const res = await fetch(data.skin);
        const blob = await res.blob();
        const skin_bitmap = await createImageBitmap(blob, {
            premultiplyAlpha: "none",
            resizeQuality: "high",
            resizeWidth: IMG_DIM,
            resizeHeight: IMG_DIM
        });
        postMessage({ id: data.id, skin: skin_bitmap, name: name_bitmap }, 
            name_bitmap ? [skin_bitmap, name_bitmap] : [skin_bitmap]);    
    } catch {
        name_bitmap ? postMessage({ id: data.id, skin: null, name: name_bitmap }, [name_bitmap]) :
            postMessage({ id: data.id, skin: null, name: null});    
    }
};