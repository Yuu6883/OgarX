const IMG_DIM = 512;
const resizer = new OffscreenCanvas(IMG_DIM, IMG_DIM);
const ctx = resizer.getContext("2d");

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

const NAME_TEXTURE_RES = 512;
const name_canvas = new OffscreenCanvas(NAME_TEXTURE_RES, NAME_TEXTURE_RES);
const name_ctx = name_canvas.getContext("2d");

name_ctx.font = "80px Bree Serif";
name_ctx.fillStyle = "white";
name_ctx.strokeStyle = "black";
name_ctx.textAlign = "center";
name_ctx.lineWidth = 8;
name_ctx.textBaseline = "middle";

onmessage = async evt => {
    /** @type {{ data: { id: number, skin: string, name: string }}} */
    const { data } = evt;
    if (!data) return;

    name_ctx.clearRect(0, 0, NAME_TEXTURE_RES, NAME_TEXTURE_RES);
    name_ctx.strokeText(data.name, NAME_TEXTURE_RES >> 1, NAME_TEXTURE_RES >> 1);
    name_ctx.fillText(data.name, NAME_TEXTURE_RES >> 1, NAME_TEXTURE_RES >> 1);

    const name_bitmap = name_canvas.transferToImageBitmap();

    const res = await fetch(data.skin);
    const blob = await res.blob();
    let image_bitmap = await createImageBitmap(blob);

    if (image_bitmap.height != IMG_DIM || image_bitmap.width != IMG_DIM) {
        ctx.drawImage(image_bitmap, 0, 0, IMG_DIM, IMG_DIM);
        image_bitmap.close();
        image_bitmap = resizer.transferToImageBitmap();
    }
    
    postMessage({ id: data.id, skin: image_bitmap, name: name_bitmap }, [image_bitmap, name_bitmap]);
};