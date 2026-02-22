from flask import Flask, request, jsonify
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import json
import re

app = Flask(__name__)

# Load your downloaded model folder here
model_path = "./interview-intelligence-model"
print(f"Loading model from {model_path}...")

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(
    model_path, 
    device_map="auto", 
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
)

def generate_interview_questions(resume_text):
    prompt = f"""
    You are an intelligent AI Interviewer for a MERN stack application.
    Analyze the following resume text and return a structured JSON response.
    
    Resume Text: {resume_text}

    Return exactly this JSON format:
    {{
      "candidate_name": "Name",
      "experience_level": "Beginner/Intermediate/Advanced",
      "questions": [
        {{ "type": "Technical", "question": "...", "reason": "Based on [Skill]" }},
        {{ "type": "Project-based", "question": "...", "reason": "Based on [Project Name]" }},
        {{ "type": "HR", "question": "...", "reason": "Behavioral assessment" }}
      ]
    }}
    """
    
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        output = model.generate(
            **inputs, 
            max_new_tokens=1024, 
            temperature=0.7, 
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    
    response_text = tokenizer.decode(output[0], skip_special_tokens=True)
    
    # Extract JSON from the response
    try:
        # Try to find JSON block
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            return json.loads(json_str)
        else:
            # Fallback if no JSON found
            return {
                "candidate_name": "Unknown",
                "experience_level": "Not specified",
                "questions": [
                    {"type": "HR", "question": "Can you walk me through your experience?", "reason": "Fallback question"}
                ]
            }
    except Exception as e:
        print(f"Error parsing model output: {e}")
        return {
            "error": "Failed to parse model output",
            "raw_output": response_text
        }

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    resume_text = data.get("resume_text", "")
    
    if not resume_text:
        return jsonify({"error": "No resume text provided"}), 400
        
    result = generate_interview_questions(resume_text)
    return jsonify(result)

if __name__ == '__main__':
    # Use port 5000 as requested
    app.run(host='0.0.0.0', port=5000)
