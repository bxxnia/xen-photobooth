// photobooth.js - handles the camera, photo capture, editing, and final output for the photobooth page.
// Requires (loaded before this file): config.js, booth-config.js
const screens = [...document.querySelectorAll("[data-screen]")];
const indicators = [...document.querySelectorAll("[data-step-indicator]")];
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const customCanvas = document.getElementById("customCanvas");
const finalImage = document.getElementById("finalImage");
const qrCanvas = document.getElementById("qrCanvas");
const startCameraButton = document.getElementById("startCamera");
const captureButton = document.getElementById("captureButton");
const cameraSelect = document.getElementById("cameraSelect");
const cameraStatus = document.getElementById("cameraStatus");
const countdown = document.getElementById("countdown");
const flashOverlay = document.getElementById("flashOverlay");
const photoNumber = document.getElementById("photoNumber");
const photoGrid = document.getElementById("photoGrid");
const toCustomizeButton = document.getElementById("toCustomize");
const imageUpload = document.getElementById("imageUpload");
const logoUpload = document.getElementById("logoUpload");
const filterSelect = document.getElementById("filterSelect");
const countdownSelect = document.getElementById("countdownSelect");
const flashToggle = document.getElementById("flashToggle");
const eventName = document.getElementById("eventName");
const eventDate = document.getElementById("eventDate");
const frameSelect = document.getElementById("frameSelect");
const editorCanvas = document.getElementById("editorCanvas");
const editorPhotos = document.getElementById("editorPhotos");
const eventTime = document.getElementById("eventTime");
const cropOpenButton = document.getElementById("cropOpen");
const cropClearButton = document.getElementById("cropClear");
const cropModal = document.getElementById("cropModal");
const cropStage = document.getElementById("cropStage");
const cropImage = document.getElementById("cropImage");
const cropBox = document.getElementById("cropBox");
const cropApplyButton = document.getElementById("cropApply");
const cropCancelButton = document.getElementById("cropCancel");
const cropResetButton = document.getElementById("cropReset");
const photoDownloads = document.getElementById("photoDownloads");
const gifSourcePhotos = document.getElementById("gifSourcePhotos");
const createGifButton = document.getElementById("createGifButton");
const downloadGifButton = document.getElementById("downloadGifButton");
const gifStatus = document.getElementById("gifStatus");
const outputStatus = document.getElementById("outputStatus");

let stream = null;
let photos = [];
let selectedLayout = "strip";
let selectedStickers = [];
let logoImage = null;
let isCapturing = false;
let selectedDeviceId = "";
let selectedPhotoIndex = 0;
let photoEdits = [];
let gifUrl = null;

// How many photos each layout expects. The real count comes from currentPhotoCount()
// (booth-config.js), which also handles the custom template's base layout.
let photoLimit = 3;

function showScreen(name) {
    screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === name));
    indicators.forEach((indicator) => indicator.classList.toggle("active", indicator.dataset.stepIndicator === name));
    if (name === "customize") {
        renderFinalCanvas();
        renderEditorPreview();
    }
    if (name === "output") prepareOutput().catch((error) => {
        console.error("Could not prepare photobooth output", error);
        outputStatus.textContent = "Could not prepare your downloads. Please try again.";
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.next)));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.back)));

// NOTE: layout card clicks and the frame picker are wired up in booth-config.js,
// because those cards/buttons are rebuilt from the admin's settings.

// Called whenever the chosen layout (and therefore its photo count) changes.
// Trims any extra photos already captured and keeps every status label in sync.
function applyLayoutPhotoLimit() {
    photoLimit = currentPhotoCount();
    if (photos.length > photoLimit) {
        photos = photos.slice(0, photoLimit);
        photoEdits = photoEdits.slice(0, photoLimit);
    }
    updatePhotoState();
    if (captureButton) captureButton.disabled = !stream || isCapturing || photos.length >= photoLimit;
    if (cameraStatus) {
        cameraStatus.textContent = photos.length >= photoLimit
            ? `All ${photoLimit} photo${photoLimit === 1 ? "" : "s"} are in. Tap one below to retake it, or continue.`
            : stream
                ? `Camera is ready. The shutter will capture ${photoLimit} frame${photoLimit === 1 ? "" : "s"}.`
                : "Tap start camera or upload your own images.";
    }
}

function updatePhotoState() {
    photoNumber.textContent = photos.length;
    document.querySelectorAll(".photo-limit-value").forEach((label) => { label.textContent = photoLimit; });
    toCustomizeButton.disabled = photos.length < 1;
    while (photoEdits.length < photos.length) photoEdits.push(createPhotoEdit());
    photoEdits.length = photos.length;
    photoGrid.innerHTML = "";
    // Retake is only offered while the set isn't finished yet, and only when the
    // camera is actually live (uploaded photos can't be "retaken" through the shutter).
    const canRetake = !isCapturing && !!stream;
    photos.forEach((photo, index) => {
        const item = document.createElement(canRetake ? "button" : "div");
        item.className = `photo-item${canRetake ? " retakeable" : ""}`;
        item.innerHTML = `<img src="${photo}" alt="Captured photo ${index + 1}">${canRetake ? '<span class="retake-label">Retake</span>' : ""}`;
        if (canRetake) {
            item.type = "button";
            item.setAttribute("aria-label", `Retake photo ${index + 1}`);
            item.addEventListener("click", () => retakePhoto(index));
        }
        photoGrid.appendChild(item);
    });
    if (selectedPhotoIndex >= photos.length) selectedPhotoIndex = Math.max(0, photos.length - 1);
    renderEditorPhotos();
}

// crop is null (no crop) or { x, y, w, h } as fractions (0-1) of the original photo.
function createPhotoEdit() {
    return { crop: null };
}

function renderEditorPhotos() {
    if (!editorPhotos) return;
    editorPhotos.innerHTML = "";
    photos.forEach((photo, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `editor-photo${index === selectedPhotoIndex ? " selected" : ""}`;
        button.dataset.photoIndex = index;
        button.setAttribute("aria-label", `Edit photo ${index + 1}`);
        button.innerHTML = `<img src="${photo}" alt="Photo ${index + 1}">`;
        button.addEventListener("click", () => selectEditorPhoto(index));
        editorPhotos.appendChild(button);
    });
    syncEditorControls();
}

// Selecting a photo shows it in the preview and opens the crop modal for it.
function selectEditorPhoto(index) {
    selectedPhotoIndex = index;
    renderEditorPhotos();
    renderEditorPreview();
    openCropModal();
}

function syncEditorControls() {
    const edit = photoEdits[selectedPhotoIndex] || createPhotoEdit();
    if (cropClearButton) cropClearButton.disabled = !edit.crop;
    if (cropOpenButton) cropOpenButton.disabled = !photos.length;
}

async function listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentValue = selectedDeviceId || cameraSelect.value;
    cameraSelect.innerHTML = "";
    cameras.forEach((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
    });
    if (currentValue && cameras.some((camera) => camera.deviceId === currentValue)) cameraSelect.value = currentValue;
}

async function startCamera(deviceId = cameraSelect.value, allowDefaultFallback = true) {
    if (!window.isSecureContext) {
        cameraStatus.textContent = "Camera access requires a secure connection. Open this page over HTTPS or through a secure local server, not as a file.";
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        cameraStatus.textContent = "Camera access is unavailable here. Upload images instead.";
        return;
    }
    try {
        if (stream) stream.getTracks().forEach((track) => track.stop());
        const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        video.srcObject = stream;
        selectedDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId;
        await listCameras();
        document.getElementById("cameraPlaceholder").hidden = true;
        startCameraButton.disabled = true;
        captureButton.disabled = photos.length >= photoLimit;
        cameraStatus.textContent = photos.length >= photoLimit
            ? `All ${photoLimit} photo${photoLimit === 1 ? "" : "s"} are in. Tap one below to retake it, or continue.`
            : `Camera is ready. The shutter will capture ${photoLimit} frame${photoLimit === 1 ? "" : "s"}.`;
        updatePhotoState();
    } catch (error) {
        console.error(error);
        if (error.name === "OverconstrainedError" && deviceId && allowDefaultFallback) {
            selectedDeviceId = "";
            cameraSelect.value = "";
            cameraStatus.textContent = "That camera is unavailable. Trying the default camera...";
            await startCamera("", false);
            return;
        }
        const messages = {
            NotAllowedError: "Camera permission was blocked. Allow camera access in your browser's site settings, then try again.",
            PermissionDeniedError: "Camera permission was blocked. Allow camera access in your browser's site settings, then try again.",
            NotFoundError: "No camera was found. Connect a webcam or upload images instead.",
            NotReadableError: "The camera is already being used by another app. Close it and try again.",
            OverconstrainedError: "No available camera matches that selection. Choose another camera or use the default camera.",
            SecurityError: "Camera access is blocked by the browser security settings. Use HTTPS or a secure local server."
        };
        cameraStatus.textContent = messages[error.name] || "The camera could not be started. Check browser permissions or upload images instead.";
    }
}

startCameraButton.addEventListener("click", startCamera);
cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value) startCamera(cameraSelect.value);
});
if (navigator.mediaDevices?.addEventListener) navigator.mediaDevices.addEventListener("devicechange", listCameras);
listCameras();

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runCountdown() {
    const seconds = Number(countdownSelect.value);
    if (!seconds) return;
    for (let number = seconds; number > 0; number -= 1) {
        countdown.textContent = number;
        countdown.classList.remove("show");
        void countdown.offsetWidth;
        countdown.classList.add("show");
        await wait(1000);
    }
    countdown.classList.remove("show");
}

function flash() {
    if (!flashToggle.checked) return;
    flashOverlay.classList.remove("flash-on");
    void flashOverlay.offsetWidth;
    flashOverlay.classList.add("flash-on");
}

// targetIndex lets a retake overwrite one existing slot instead of appending a new photo.
function capturePhoto(targetIndex = null) {
    if (!video.videoWidth || !video.videoHeight) return;
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.filter = filterSelect.value;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    if (targetIndex === null || targetIndex === undefined) {
        photos.push(dataUrl);
    } else {
        photos[targetIndex] = dataUrl;
    }
    flash();
    updatePhotoState();
}

captureButton.addEventListener("click", async () => {
    if (!stream || isCapturing || photos.length >= photoLimit) return;
    isCapturing = true;
    captureButton.disabled = true;
    updatePhotoState();
    cameraStatus.textContent = `Get ready... capturing your ${photoLimit} frame${photoLimit === 1 ? "" : "s"}.`;
    while (photos.length < photoLimit) {
        await runCountdown();
        capturePhoto();
        await wait(450);
    }
    isCapturing = false;
    cameraStatus.textContent = `All ${photoLimit} photo${photoLimit === 1 ? "" : "s"} are in. Tap one below to retake it, or continue.`;
    toCustomizeButton.disabled = false;
    updatePhotoState();
});

// Retakes a single already-captured photo. Only available while the set is
// still incomplete (photos.length < photoLimit), per the layout's photo count.
async function retakePhoto(index) {
    if (!stream || isCapturing) return;
    if (index < 0 || index >= photos.length) return;   // tinanggal ang "|| photos.length >= photoLimit"
    isCapturing = true;
    captureButton.disabled = true;
    updatePhotoState();
    cameraStatus.textContent = `Retaking photo ${index + 1}...`;
    await runCountdown();
    capturePhoto(index);
    photoEdits[index] = createPhotoEdit();   // BAGONG LINYA
    isCapturing = false;
    captureButton.disabled = photos.length >= photoLimit;
    cameraStatus.textContent = photos.length >= photoLimit
        ? `All ${photoLimit} photo${photoLimit === 1 ? "" : "s"} are in. Tap one below to retake it, or continue.`
        : `${photos.length} of ${photoLimit} photos ready.`;
    updatePhotoState();
}

function readImages(files) {
    [...files].slice(0, photoLimit - photos.length).forEach((file) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            photos.push(reader.result);
            updatePhotoState();
            cameraStatus.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"} ready.`;
        });
        reader.readAsDataURL(file);
    });
}

imageUpload.addEventListener("change", (event) => readImages(event.target.files));
filterSelect.addEventListener("change", () => { video.style.filter = filterSelect.value; });

function loadImage(source) {
    return new Promise((resolve) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.src = source;
    });
}

// Returns the crop area in the image's own pixels. No crop = the whole image.
function getCropRect(image, edit) {
    const crop = edit?.crop;
    if (!crop) return { x: 0, y: 0, width: image.width, height: image.height };
    return {
        x: crop.x * image.width,
        y: crop.y * image.height,
        width: Math.max(1, crop.w * image.width),
        height: Math.max(1, crop.h * image.height)
    };
}

// Draws the cropped area into the slot, centre-fitting it so it is never stretched.
function drawPhoto(context, image, x, y, width, height, edit = createPhotoEdit()) {
    const crop = getCropRect(image, edit);
    let sx = crop.x, sy = crop.y, sw = crop.width, sh = crop.height;
    const slotRatio = width / height;
    const cropRatio = sw / sh;
    if (cropRatio > slotRatio) {
        const newWidth = sh * slotRatio;
        sx += (sw - newWidth) / 2;
        sw = newWidth;
    } else if (cropRatio < slotRatio) {
        const newHeight = sw / slotRatio;
        sy += (sh - newHeight) / 2;
        sh = newHeight;
    }
    context.save();
    context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
    context.restore();
}

// Side preview shows exactly the area the user cropped.
async function renderEditorPreview() {
    if (!editorCanvas || !photos.length) return;
    const image = await loadImage(photos[selectedPhotoIndex]);
    const edit = photoEdits[selectedPhotoIndex] || createPhotoEdit();
    const crop = getCropRect(image, edit);
    editorCanvas.width = 720;
    editorCanvas.height = Math.max(1, Math.round(720 * crop.height / crop.width));
    editorCanvas.getContext("2d").drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, editorCanvas.width, editorCanvas.height);
}

// ---------- Manual crop modal ----------
// cropState and cropDrag use pixels of the picture as displayed inside the modal.
const MIN_CROP = 24;
let cropState = null;
let cropDrag = null;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function renderCropBox() {
    if (!cropState) return;
    cropBox.style.left = `${cropState.x}px`;
    cropBox.style.top = `${cropState.y}px`;
    cropBox.style.width = `${cropState.w}px`;
    cropBox.style.height = `${cropState.h}px`;
}

function fullCropState() {
    return { x: 0, y: 0, w: cropImage.clientWidth, h: cropImage.clientHeight };
}

function initCropState() {
    if (!cropImage.clientWidth || !cropImage.clientHeight) return;
    const W = cropImage.clientWidth;
    const H = cropImage.clientHeight;
    const crop = (photoEdits[selectedPhotoIndex] || createPhotoEdit()).crop;
    cropState = crop ? { x: crop.x * W, y: crop.y * H, w: crop.w * W, h: crop.h * H } : fullCropState();
    renderCropBox();
}

function openCropModal() {
    if (!photos.length || !cropModal) return;
    cropModal.hidden = false;
    cropImage.onload = initCropState;
    cropImage.src = photos[selectedPhotoIndex];
    if (cropImage.complete && cropImage.naturalWidth) initCropState();
}

function closeCropModal() {
    cropModal.hidden = true;
    cropDrag = null;
}

function applyCrop() {
    const W = cropImage.clientWidth;
    const H = cropImage.clientHeight;
    if (!cropState || !W || !H) return closeCropModal();
    const isFull = cropState.x <= 1 && cropState.y <= 1 && cropState.w >= W - 2 && cropState.h >= H - 2;
    const edit = photoEdits[selectedPhotoIndex] || createPhotoEdit();
    edit.crop = isFull ? null : { x: cropState.x / W, y: cropState.y / H, w: cropState.w / W, h: cropState.h / H };
    photoEdits[selectedPhotoIndex] = edit;
    closeCropModal();
    syncEditorControls();
    renderEditorPreview();
    renderFinalCanvas();
}

function clearSelectedCrop() {
    if (!photos.length) return;
    const edit = photoEdits[selectedPhotoIndex] || createPhotoEdit();
    edit.crop = null;
    photoEdits[selectedPhotoIndex] = edit;
    syncEditorControls();
    renderEditorPreview();
    renderFinalCanvas();
}

cropStage.addEventListener("pointerdown", (event) => {
    if (!cropState) return;
    event.preventDefault();
    const bounds = cropStage.getBoundingClientRect();
    const W = cropImage.clientWidth;
    const H = cropImage.clientHeight;
    const px = clamp(event.clientX - bounds.left, 0, W);
    const py = clamp(event.clientY - bounds.top, 0, H);
    const handle = event.target.dataset ? event.target.dataset.h : undefined;
    let mode = "draw";
    if (handle) mode = "resize";
    else if (event.target === cropBox) mode = "move";
    cropDrag = { mode, handle, startX: px, startY: py, start: { ...cropState }, previous: { ...cropState } };
    if (mode === "draw") cropState = { x: px, y: py, w: 0, h: 0 };
    cropStage.setPointerCapture(event.pointerId);
    renderCropBox();
});

cropStage.addEventListener("pointermove", (event) => {
    if (!cropDrag) return;
    const bounds = cropStage.getBoundingClientRect();
    const W = cropImage.clientWidth;
    const H = cropImage.clientHeight;
    const px = clamp(event.clientX - bounds.left, 0, W);
    const py = clamp(event.clientY - bounds.top, 0, H);
    const dx = px - cropDrag.startX;
    const dy = py - cropDrag.startY;
    const s = cropDrag.start;
    if (cropDrag.mode === "move") {
        cropState = { x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h), w: s.w, h: s.h };
    } else if (cropDrag.mode === "resize") {
        let left = s.x, right = s.x + s.w, top = s.y, bottom = s.y + s.h;
        const h = cropDrag.handle;
        if (h.includes("w")) left = clamp(s.x + dx, 0, right - MIN_CROP);
        if (h.includes("e")) right = clamp(s.x + s.w + dx, left + MIN_CROP, W);
        if (h.includes("n")) top = clamp(s.y + dy, 0, bottom - MIN_CROP);
        if (h.includes("s")) bottom = clamp(s.y + s.h + dy, top + MIN_CROP, H);
        cropState = { x: left, y: top, w: right - left, h: bottom - top };
    } else {
        cropState = {
            x: Math.min(cropDrag.startX, px),
            y: Math.min(cropDrag.startY, py),
            w: Math.abs(px - cropDrag.startX),
            h: Math.abs(py - cropDrag.startY)
        };
    }
    renderCropBox();
});

function endCropDrag() {
    if (!cropDrag) return;
    // A drawn selection that is too small (e.g. a simple tap) is ignored.
    if (cropDrag.mode === "draw" && (cropState.w < MIN_CROP || cropState.h < MIN_CROP)) {
        cropState = cropDrag.previous;
        renderCropBox();
    }
    cropDrag = null;
}

cropStage.addEventListener("pointerup", endCropDrag);
cropStage.addEventListener("pointercancel", endCropDrag);

cropApplyButton.addEventListener("click", applyCrop);
cropCancelButton.addEventListener("click", closeCropModal);
cropResetButton.addEventListener("click", () => {
    cropState = fullCropState();
    renderCropBox();
});
cropModal.addEventListener("pointerdown", (event) => {
    if (event.target === cropModal) closeCropModal();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cropModal.hidden) closeCropModal();
});
window.addEventListener("resize", () => {
    if (!cropModal.hidden) initCropState();
});
cropOpenButton.addEventListener("click", openCropModal);
cropClearButton.addEventListener("click", clearSelectedCrop);

async function renderFinalCanvas() {
    const context = customCanvas.getContext("2d");
    const type = layoutType();
    const width = 900;
    const footerHeight = 150;
    const padding = 54;
    const gap = 26;
    const images = await Promise.all(photos.map(loadImage));
    while (photoEdits.length < images.length) photoEdits.push(createPhotoEdit());

    // Height adapts to how many photos this layout actually holds.
    let height;
    if (type === "strip") {
        height = width * 3;
    } else if (type === "polaroid") {
        const rows = Math.max(1, Math.ceil(images.length / 2));
        height = padding * 2 + footerHeight + rows * 434 + Math.max(0, rows - 1) * gap;
    } else {
        height = 1100;
    }

    customCanvas.width = width;
    customCanvas.height = height;
    drawBackground(context, width, height); // the frame IS the background
    const look = resolveLook();
    const contentHeight = height - padding * 2 - footerHeight;

    const placePhoto = (image, x, y, w, h, edit) => {
        drawPhoto(context, image, x, y, w, h, edit);
    };

    if (type === "strip") {
        const photoCount = XenConfig.TYPE_COUNTS.strip;
        const photoHeight = (contentHeight - gap * (photoCount - 1)) / photoCount;
        images.slice(0, photoCount).forEach((image, index) => placePhoto(image, padding, padding + index * (photoHeight + gap), width - padding * 2, photoHeight, photoEdits[index]));
    } else if (type === "polaroid") {
        const photoWidth = (width - padding * 2 - gap) / 2;
        const rows = Math.max(1, Math.ceil(images.length / 2));
        const photoHeight = (contentHeight - Math.max(0, rows - 1) * gap) / rows;
        images.forEach((image, index) => {
            const x = padding + (index % 2) * (photoWidth + gap);
            const y = padding + Math.floor(index / 2) * (photoHeight + gap);
            drawPhoto(context, image, x, y, photoWidth, photoHeight, photoEdits[index]);
        });
    } else {
        const photoWidth = (width - padding * 2 - gap) / 2;
        const photoHeight = (contentHeight - gap) / 2;
        images.slice(0, 4).forEach((image, index) => placePhoto(image, padding + (index % 2) * (photoWidth + gap), padding + Math.floor(index / 2) * (photoHeight + gap), photoWidth, photoHeight, photoEdits[index]));
    }

    context.fillStyle = look.text;
    context.textAlign = "center";
    context.font = "700 28px 'Playfair Display', serif";
    context.fillText(look.tpl?.brandText || "XEN PHOTOBOOTH", width / 2, height - footerHeight + 42);
    context.font = "18px DM Sans, sans-serif";
    context.fillText(eventName.value || look.tpl?.eventName || "made with love", width / 2, height - footerHeight + 76);
    context.font = "16px DM Sans, sans-serif";
    const dateTime = [eventDate.value.trim(), eventTime.value.trim()].filter(Boolean).join(" · ");
    if (dateTime) context.fillText(dateTime, width / 2, height - footerHeight + 108);
    drawStickers(context, width);

    // Logo (user's upload first, otherwise the template's) sits in the footer, bottom-right.
    const logo = logoImage || templateLogo;
    if (logo) {
        const boxW = 130, boxH = 70;
        const s = Math.min(boxW / logo.width, boxH / logo.height);
        const lw = logo.width * s, lh = logo.height * s;
        context.drawImage(logo, width - padding - lw, height - footerHeight + 30 + (boxH - lh) / 2, lw, lh);
    }
}

function drawStickers(context, width) {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = '48px "Segoe UI Symbol", serif';
    context.fillStyle = "#df91a7";
    context.strokeStyle = "#fffaf7";
    context.lineWidth = 6;
    context.shadowColor = "rgba(89, 100, 94, .18)";
    context.shadowBlur = 5;
    selectedStickers.forEach((sticker, index) => {
        const x = 76 + index * 68;
        context.strokeText(sticker, x, 42);
        context.fillText(sticker, x, 42);
    });
    context.restore();
}

[eventName, eventDate, eventTime, frameSelect].forEach((control) => control.addEventListener("input", renderFinalCanvas));
document.querySelectorAll("[data-sticker]").forEach((button) => {
    button.addEventListener("click", () => {
        const sticker = button.dataset.sticker;
        const stickerIndex = selectedStickers.indexOf(sticker);
        if (stickerIndex === -1) {
            selectedStickers.push(sticker);
            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");
        } else {
            selectedStickers.splice(stickerIndex, 1);
            button.classList.remove("selected");
            button.setAttribute("aria-pressed", "false");
        }
        renderFinalCanvas().catch((error) => console.error("Could not render sticker preview", error));
    });
});

logoUpload.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    logoImage = new Image();
    logoImage.addEventListener("load", renderFinalCanvas);
    logoImage.src = URL.createObjectURL(file);
});

async function prepareOutput() {
    await renderFinalCanvas();
    if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        gifUrl = null;
        downloadGifButton.href = "#";
        downloadGifButton.hidden = true;
        gifStatus.textContent = "";
    }
    const imageUrl = customCanvas.toDataURL("image/jpeg", 0.92);
    finalImage.src = imageUrl;
    renderQrCode(new URL("photobooth.html", window.location.href).href);
    await buildPhotoDownloads();
    outputStatus.textContent = "";
}

function renderQrCode(value) {
    const qrPanel = qrCanvas.parentElement;
    const existingFallback = qrPanel.querySelector(".qr-fallback");
    existingFallback?.remove();
    qrCanvas.hidden = true;
    qrCanvas.getContext("2d").clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    renderQrFallback(qrPanel, value);
}

function renderQrFallback(qrPanel, value) {
    qrCanvas.hidden = true;
    const fallback = document.createElement("img");
    fallback.className = "qr-fallback";
    fallback.alt = "QR code for this photobooth page";
    const qrEndpoint = new URL("/qr", window.location.href);
    qrEndpoint.searchParams.set("data", value);
    fallback.src = qrEndpoint.href;
    fallback.addEventListener("error", () => {
        fallback.remove();
        const message = document.createElement("span");
        message.className = "qr-fallback-message";
        message.textContent = "Start the local server to show the QR code.";
        qrPanel.prepend(message);
    }, { once: true });
    qrPanel.prepend(fallback);
}

function downloadPhoto() {
    const link = document.createElement("a");
    link.download = "xen-photobooth-memory.jpg";
    link.href = customCanvas.toDataURL("image/jpeg", 0.95);
    link.click();
}

async function buildPhotoDownloads() {
    photoDownloads.innerHTML = "";
    gifSourcePhotos.textContent = photos.map((_, index) => `Photo ${index + 1}`).join(" + ");
    for (let index = 0; index < photos.length; index++) {
        const image = await loadImage(photos[index]);
        const crop = getCropRect(image, photoEdits[index]);
        const photoCanvas = document.createElement("canvas");
        photoCanvas.width = Math.max(1, Math.round(crop.width));
        photoCanvas.height = Math.max(1, Math.round(crop.height));
        photoCanvas.getContext("2d").drawImage(
            image,
            crop.x, crop.y, crop.width, crop.height,
            0, 0, photoCanvas.width, photoCanvas.height
        );
        const link = document.createElement("a");
        link.className = "photo-download";
        link.textContent = `Download Photo ${index + 1}`;
        link.download = `xen-photobooth-photo-${index + 1}.jpg`;
        link.href = photoCanvas.toDataURL("image/jpeg", 0.95);
        photoDownloads.appendChild(link);
    }
}

async function createAnimatedGif() {
    if (!photos.length || createGifButton.disabled) return;
    createGifButton.disabled = true;
    downloadGifButton.hidden = true;
    if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        gifUrl = null;
    }
    gifStatus.textContent = "Preparing your animated GIF...";
    let workerError = null;
    try {
        if (typeof window.GIF !== "function") {
            throw new Error("The GIF encoder did not load. Refresh the page and try again.");
        }
        const gifScript = [...document.scripts].find((script) => script.src.includes("/vendor/gif.js/gif.js"));
        if (!gifScript) {
            throw new Error("The GIF encoder script URL could not be found.");
        }
        const images = await Promise.all(photos.map(loadImage));
        const firstCrop = getCropRect(images[0], photoEdits[0]);
        const aspectRatio = firstCrop.width / firstCrop.height;
        const width = aspectRatio >= 1 ? 480 : Math.max(1, Math.round(480 * aspectRatio));
        const height = aspectRatio >= 1 ? Math.max(1, Math.round(480 / aspectRatio)) : 480;
        const gif = new window.GIF({
            workers: 2,
            quality: 10,
            repeat: 0,
            width,
            height,
            workerScript: new URL("gif.worker.js", gifScript.src).href
        });
        images.forEach((image, index) => {
            const frame = document.createElement("canvas");
            frame.width = width;
            frame.height = height;
            drawPhoto(frame.getContext("2d"), image, 0, 0, width, height, photoEdits[index]);
            gif.addFrame(frame, { delay: 700, copy: true });
        });
        gif.on("progress", (progress) => {
            gifStatus.textContent = `Creating GIF... ${Math.round(progress * 100)}%`;
        });
        gif.on("start", () => {
            gif.activeWorkers.forEach((worker) => {
                worker.addEventListener("error", (event) => {
                    workerError = new Error(event.message || "The GIF worker could not load.");
                    console.error("GIF worker failed", event);
                    gif.abort();
                }, { once: true });
            });
        });
        gif.on("finished", (blob) => {
            gifUrl = URL.createObjectURL(blob);
            downloadGifButton.href = gifUrl;
            downloadGifButton.hidden = false;
            createGifButton.disabled = false;
            gifStatus.textContent = "Your animated GIF is ready to download.";
        });
        gif.on("abort", () => {
            createGifButton.disabled = false;
            gifStatus.textContent = workerError
                ? `GIF worker failed: ${workerError.message}`
                : "GIF creation was cancelled. Please try again.";
        });
        gif.render();
    } catch (error) {
        console.error("Could not create animated GIF", error);
        createGifButton.disabled = false;
        gifStatus.textContent = `Could not create the GIF: ${error.message || "unknown error"}`;
    }
}

document.getElementById("downloadButton").addEventListener("click", downloadPhoto);
document.getElementById("saveButton").addEventListener("click", downloadPhoto);
createGifButton.addEventListener("click", createAnimatedGif);
document.getElementById("printButton").addEventListener("click", () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<img src="${customCanvas.toDataURL("image/jpeg", 0.95)}" style="max-width:100%">`);
    printWindow.document.close();
    printWindow.addEventListener("load", () => printWindow.print());
});

updatePhotoState();
applyBoothConfig(); // apply the admin's settings on load (layouts, frames, default template)