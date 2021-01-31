let loaded = false;

(async() => {
    const font = new FontFace("Lato", "url(/static/font/Lato-Bold.ttf)");
    fonts.add(font);
    await font.load();
    loaded = true;
})();

onmessage = async evt => {

    if (!loaded) return setTimeout(() => onmessage(evt), 3000);

    /** @type {{ data: { id: number, skin: string, name: string, skin_dim: number }}} */
    const { data } = evt;
    if (!data || !data.id) return;

    if (data.name) {
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
                const name_bitmap = name_canvas.transferToImageBitmap();
                // Send name bitmap back to renderer worker
                self.postMessage({ id: data.id, name: name_bitmap }, [name_bitmap]);
            }
        } catch (e) {
            console.log(`Failed to load name: "${data.name}" (pid: ${data.id})`, e);
        }
    }

    if (data.skin) {
        try {
            if (!/https?:\/\//.test(data.skin) && 
                !/^\/static\/img\/virus-\d+.png/.test(data.skin)) 
                throw new Error("Invalid skin");
    
            const res = await fetch(data.skin);
            const blob = await res.blob();
            const skin_bitmap = await createImageBitmap(blob, {
                premultiplyAlpha: "none",
                resizeQuality: "high",
                resizeWidth: data.skin_dim,
                resizeHeight: data.skin_dim
            });
            postMessage({ id: data.id, skin: skin_bitmap }, [skin_bitmap]);
        } catch (e) {
            console.log(`Failed to load skin: "${data.skin}" (pid: ${data.id})`, e);
        }
    }
};