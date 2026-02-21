import tensorflow as tf
from tensorflow.keras import layers, models

# 1. Define a simple model (e.g., for Skill Classification)
model = models.Sequential([
    layers.Dense(64, activation='relu', input_shape=(10,)),
    layers.Dense(32, activation='relu'),
    layers.Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam', loss='binary_crossentropy')

# 2. Save the model as an .h5 file
model.save('interview_analysis_model.h5')

print("Model saved as interview_analysis_model.h5")
print("To use this in Node.js, run the following in your terminal:")
print("pip install tensorflowjs")
print("tensorflowjs_converter --input_format keras interview_analysis_model.h5 model_json")
