document.addEventListener("DOMContentLoaded", () => {

    const storedResult = sessionStorage.getItem('mindmate_result');
    if (!storedResult) {
        alert("No recent quiz result found. Redirecting to home.");
        window.location.href = 'index.html';
        return;
    }

    const { score, feedback } = JSON.parse(storedResult);

    // Apply numerical score
    const scoreElement = document.getElementById('res-score');
    scoreElement.innerText = `${score}%`;

    // Animate Circular Progress (Max dashoffset 314 to 0)
    const circle = document.getElementById('score-circle');
    const bgPercentValue = 314 - (314 * (score / 100));
    setTimeout(() => {
        circle.style.strokeDashoffset = bgPercentValue;
    }, 100);

    // Dynamically colorize text based on score bracket
    const categoryElement = document.getElementById('res-category');
    categoryElement.innerText = feedback.category || 'Evaluated';
    if(score >= 75) {
        scoreElement.className = "position-absolute top-50 start-50 translate-middle fw-bold mb-0 text-success";
        categoryElement.className = "fw-bold mb-1 text-success";
        circle.style.stroke = "#198754";
    } else if (score <= 40) {
        scoreElement.className = "position-absolute top-50 start-50 translate-middle fw-bold mb-0 text-warning";
        categoryElement.className = "fw-bold mb-1 text-warning";
        circle.style.stroke = "#ffc107";
    }

    // Populate Mood and Personality
    document.getElementById('res-mood').innerText = feedback.mood || "Neutral";
    document.getElementById('res-personality').innerText = feedback.personalityType || "Reflective Individual";

    // Populate Strengths
    const strengthsContainer = document.getElementById('res-strengths');
    strengthsContainer.innerHTML = '';
    if(feedback.strengths && Array.isArray(feedback.strengths)) {
        feedback.strengths.forEach(st => {
            const li = document.createElement('li');
            li.innerHTML = `✓ ${st}`;
            li.className = "py-1";
            strengthsContainer.appendChild(li);
        });
    }

    // Populate Weaknesses
    const weaknessesContainer = document.getElementById('res-weaknesses');
    weaknessesContainer.innerHTML = '';
    if(feedback.weaknesses && Array.isArray(feedback.weaknesses)) {
        feedback.weaknesses.forEach(wk => {
            const li = document.createElement('li');
            li.innerHTML = `• ${wk}`;
            li.className = "py-1";
            weaknessesContainer.appendChild(li);
        });
    }

    // Populate Suggestions
    const suggestionsContainer = document.getElementById('res-suggestions');
    suggestionsContainer.innerHTML = '';
    if(feedback.suggestions && Array.isArray(feedback.suggestions)) {
        feedback.suggestions.forEach(sg => {
            const p = document.createElement('p');
            p.className = "mb-0 fs-6";
            p.innerText = sg;
            suggestionsContainer.appendChild(p);
        });
    }

});
