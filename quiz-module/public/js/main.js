document.addEventListener("DOMContentLoaded", () => {
    
    // UI Elements
    const quizContainer = document.getElementById('quiz-container');
    const loader = document.getElementById('loader');
    const questionIndicator = document.getElementById('question-indicator');
    const progressBar = document.getElementById('progress-bar');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');

    // State Variables
    let questionsPool = [];
    let currentQuestionIndex = 0;
    let userAnswers = [];
    // answers format: { questionId: 1, optionId: 2 }

    // Init Logic
    fetchQuestions();

    async function fetchQuestions() {
        try {
            const response = await fetch('/api/questions');
            if(!response.ok) throw new Error("Failed to load questions from backend");
            
            questionsPool = await response.json();
            
            // Switch UI
            loader.classList.add('d-none');
            quizContainer.classList.remove('d-none');
            
            renderQuestion();

        } catch (error) {
            console.error(error);
            questionText.innerText = "🚨 Error loading questions. Please try again later.";
            loader.classList.add('d-none');
            quizContainer.classList.remove('d-none');
        }
    }

    function renderQuestion() {
        const questionData = questionsPool[currentQuestionIndex];
        
        // Update indicators
        const currentQNum = currentQuestionIndex + 1;
        questionIndicator.innerText = `Question ${currentQNum}/${questionsPool.length}`;
        progressBar.style.width = `${(currentQNum / questionsPool.length) * 100}%`;
        
        // Reset buttons
        nextBtn.disabled = true;
        
        // Animate question refresh
        questionText.classList.remove('text-fade-in');
        void questionText.offsetWidth; // Trigger reflow
        questionText.classList.add('text-fade-in');

        questionText.innerText = questionData.question;

        // Render options dynamically
        optionsContainer.innerHTML = '';
        questionData.options.forEach((opt) => {
            const optionDiv = document.createElement('div');
            
            const radioInput = document.createElement('input');
            radioInput.type = 'radio';
            radioInput.name = 'quiz-option';
            radioInput.id = `option-${opt.id}`;
            radioInput.value = opt.id;
            radioInput.className = 'option-radio';

            const label = document.createElement('label');
            label.htmlFor = `option-${opt.id}`;
            label.className = 'option-label w-100 fs-5';
            label.innerText = opt.description;

            // Event listener to enable Next button on select
            radioInput.addEventListener('change', () => {
                const selected = document.querySelector('input[name="quiz-option"]:checked');
                if (selected) {
                    if (currentQuestionIndex === questionsPool.length - 1) {
                        submitBtn.classList.remove('d-none');
                        nextBtn.classList.add('d-none');
                        submitBtn.disabled = false;
                    } else {
                        nextBtn.disabled = false;
                    }
                }
            });

            optionDiv.appendChild(radioInput);
            optionDiv.appendChild(label);
            optionsContainer.appendChild(optionDiv);
        });
    }

    nextBtn.addEventListener('click', () => {
        // Save answer
        const selectedRadio = document.querySelector('input[name="quiz-option"]:checked');
        if (selectedRadio) {
            userAnswers.push({
                questionId: questionsPool[currentQuestionIndex].id,
                optionId: parseInt(selectedRadio.value)
            });
            currentQuestionIndex++;
            renderQuestion();
        }
    });

    submitBtn.addEventListener('click', async () => {
        // Save final answer
        const selectedRadio = document.querySelector('input[name="quiz-option"]:checked');
        if (selectedRadio) {
            userAnswers.push({
                questionId: questionsPool[currentQuestionIndex].id,
                optionId: parseInt(selectedRadio.value)
            });
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Processing...';

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: userAnswers })
            });

            if (!response.ok) throw new Error("Submission failed.");

            const data = await response.json();
            
            // Store data temporarily to share and redirect nicely
            sessionStorage.setItem('sevak_result', JSON.stringify(data));
            window.location.href = 'result.html';

        } catch (error) {
            console.error(error);
            alert("Error submitting the quiz. Please try again.");
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Assessment';
        }
    });

});
