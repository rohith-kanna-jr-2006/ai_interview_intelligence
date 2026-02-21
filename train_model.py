import tensorflow as tf
import numpy as np
from tensorflow.keras import layers, models

# 1. Generate Synthetic Training Data (Simulated Interview Performance)
def generate_data(samples=1000):
    # Random metrics between 0 and 1
    X = np.random.rand(samples, 10)
    
    # Simple rule-based labeling: 
    # High scores in Technical (index 3), Communication (index 2) and Low FraudRisk (index 7) = HIRE (1)
    y = []
    for row in X:
        score = (row[0] * 0.1 + row[1] * 0.1 + row[2] * 0.3 + 
                 row[3] * 0.4 + row[4] * 0.05 + row[5] * 0.05) - (row[7] * 0.5)
        y.append(1 if score > 0.4 else 0)
    
    return X, np.array(y)

print("--- Data Generation ---")
X_train, y_train = generate_data(2000)
X_test, y_test = generate_data(200)

# 2. Define the Deep Learning Model Architecture
model = models.Sequential([
    layers.Dense(128, activation='relu', input_shape=(10,)),
    layers.Dropout(0.2), # Dropout layer for better generalization
    layers.Dense(64, activation='relu'),
    layers.Dense(32, activation='relu'),
    layers.Dense(16, activation='relu'),
    layers.Dense(1, activation='sigmoid') # Sigmoid for Binary Classification (Hire/Reject)
])

# 3. Model Compilation
model.compile(
    optimizer='adam',
    loss='binary_crossentropy',
    metrics=['accuracy']
)

# 4. Training the Model
print("\n--- Training Model ---")
history = model.fit(
    X_train, y_train, 
    epochs=50, 
    batch_size=32, 
    validation_split=0.2,
    verbose=1
)

# 5. Model Evaluation
print("\n--- Evaluating Model ---")
test_loss, test_acc = model.evaluate(X_test, y_test)
print(f"Test Accuracy: {test_acc:.4f}")

# 6. Save the Trained Model
model.save('interview_analysis_model.h5')
print("\nModel saved successfully as 'interview_analysis_model.h5'")

# 7. (Optional) Export for Web Deployment (TFJS)
# To use this in your React/Node frontend, you'll need the conversion steps:
# print("\nTo convert for web use:")
# print("pip install tensorflowjs")
# print("tensorflowjs_converter --input_format keras interview_analysis_model.h5 ./web_model")
