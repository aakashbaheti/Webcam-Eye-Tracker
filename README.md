=# 👁️ Eye Tracking Heatmap Demo

A browser-based eye-tracking demo that uses a webcam to estimate where a user is looking on an image. The app supports **calibration**, a **live gaze dot**, and a **heatmap visualization**.

> Webcam-based eye tracking is approximate and intended for demos, UX studies, and coursework — not research-grade analysis.

---

## ✨ Features

* Webcam-based eye tracking (no paid hardware)
* Calibration dots placed **directly on the image**
* Live red gaze dot
* Heatmap of gaze concentration
* Works with uploaded images of any size
* Optional CSV export

---

## 🚀 How to Run

1. Open the project in **VS Code**
2. Use **Live Server**
3. Open: `http://127.0.0.1:5500/index.html`

> Webcam access will not work via `file://`.

---

## 🎯 How to Use

1. **Start** → allow webcam access
2. **Calibrate (9 dots)**

   * Stare at each blue dot and click it several times
3. Look at the image
4. **Show Heatmap** to visualize attention

---

## 🎛️ Accuracy Notes

* Calibration quality strongly affects accuracy
* Smoothing and noise filtering reduce jitter
* Expect ~1–3 cm error on screen

Tunable values in `app.js`:

```js
const SMOOTHING = 0.20;
const DEAD_PX = 4;
```

---

## ⚠️ Limitations

* Sensitive to lighting and head movement
* Accuracy drifts over time → recalibrate as needed
* Not suitable for medical or research use

---

## 🧠 Tech Stack

* WebGazer.js
* HTML / CSS / JavaScript
* HTML5 Canvas
* Webcam (browser API)


<img width="1120" height="628" alt="image" src="https://github.com/user-attachments/assets/bf321f89-37c3-4cc8-8269-365c71d97274" />


<img width="1119" height="626" alt="image" src="https://github.com/user-attachments/assets/c3eb2e95-94c4-4f16-b156-beff76c5d029" />



