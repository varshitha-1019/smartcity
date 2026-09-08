from PIL import Image
import numpy as np
import tensorflow as tf
import os, json

img_path = 'backend/uploads/1788721565385-601837779.png'
img = Image.open(img_path).convert('RGB')
w, h = img.size
print(f'Original size: {w}x{h}')

model = tf.keras.models.load_model('ai/model/urban_issue_classifier.keras', compile=False)
class_names = json.loads(open('ai/model/class_names.json').read())

def predict_crop(crop_box, label):
    c = img.crop(crop_box) if crop_box else img
    arr = np.expand_dims(np.array(c.resize((224, 224), Image.Resampling.LANCZOS)), axis=0)
    probs = model.predict(arr, verbose=0)[0]
    top_i = int(np.argmax(probs))
    d_i = class_names.index("Drainage")
    g_i = class_names.index("Garbage")
    print(f"{label}: Top={class_names[top_i]} ({probs[top_i]*100:.1f}%) | Drainage={probs[d_i]*100:.2f}% | Garbage={probs[g_i]*100:.2f}%")

predict_crop(None, "Full Image")
predict_crop((int(w*0.04), int(h*0.15), int(w*0.96), int(h*0.72)), "Current crop (15-72%)")
predict_crop((int(w*0.04), int(h*0.25), int(w*0.96), int(h*0.85)), "Shifted down (25-85%)")
predict_crop((int(w*0.04), int(h*0.35), int(w*0.96), int(h*0.90)), "Focus drain (35-90%)")
predict_crop((int(w*0.15), int(h*0.45), int(w*0.85), int(h*0.85)), "Culvert pipe & dirty water (45-85%)")
