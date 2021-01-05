const IMG_DIM = 512;

onmessage = async evt => {
    /** @type {{ data: { id: number, skin: string, name: string }}} */
    const { data } = evt;
    if (!data) return;

    let name_bitmap;

    // Firefox is an amazing browser
    try {
        const name_canvas = new OffscreenCanvas(0, 500);
        const name_ctx = name_canvas.getContext("2d");
        name_ctx.font = "bold 320px Lato";
        name_ctx.fillStyle = "white";
        name_ctx.strokeStyle = "black";
        name_ctx.textAlign = "center";
        name_ctx.lineWidth = 26;
        name_ctx.textBaseline = "middle";
    
        const m = name_ctx.measureText(data.name);
        
        if (m.width) {
            name_canvas.width = Math.ceil(m.width + 40);
            name_ctx.font = "bold 320px Lato";
            name_ctx.fillStyle = "white";
            name_ctx.strokeStyle = "black";
            name_ctx.textAlign = "center";
            name_ctx.lineWidth = 26;
            name_ctx.textBaseline = "middle";
            name_ctx.clearRect(0, 0, name_canvas.width, name_canvas.height);
            name_ctx.strokeText(data.name, name_canvas.width >> 1, name_canvas.height >> 1);
            name_ctx.fillText(data.name, name_canvas.width >> 1, name_canvas.height >> 1);
            name_bitmap = name_canvas.transferToImageBitmap();
        }
    } catch (e) {
        console.error(data, e);
    }

    try {
        if (!/https?:\/\//.test(data.skin) || data.skin != "/static/img/virus.png") throw new Error("Invalid skin");
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
    } catch (e) {
        console.log(`Failed to load skin: "${data.skin}" (pid: ${data.id})`);
        postMessage({ id: data.id, skin: null, name: name_bitmap });
    }
};