document.addEventListener('DOMContentLoaded', function() {
    // --- منطق الصفحة الرئيسية (index.html) ---
    const generatorForm = document.getElementById('generator-form');
    if (generatorForm) {
        generatorForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const form = event.target;
            const loadingMessage = document.getElementById('loading-message');

            form.classList.add('hidden');
            loadingMessage.classList.remove('hidden');

            const specialty = document.getElementById('specialty').value;
            const year = document.getElementById('year').value;
            const subject = document.getElementById('subject').value;

            try {
                const response = await fetch('/generate-questions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ specialty, year, subject }),
                });

                if (!response.ok) {
                    throw new Error('فشل الاتصال بالخادم');
                }

                const data = await response.json();

                localStorage.setItem('examQuestions', JSON.stringify(data.questions));
                localStorage.setItem('examSubject', subject);
                localStorage.setItem('examSpecialty', specialty);
                localStorage.setItem('examYear', year);

                window.location.href = 'exam.html';

            } catch (error) {
                console.error('Error:', error);
                alert('حدث خطأ أثناء إنشاء النموذج. يرجى المحاولة مرة أخرى.');
                form.classList.remove('hidden');
                loadingMessage.classList.add('hidden');
            }
        });
    }

    // --- منطق صفحة الاختبار (exam.html) ---
    const examContainer = document.querySelector('.exam-container');
    if (examContainer) {
        const questions = JSON.parse(localStorage.getItem('examQuestions'));
        const subject = localStorage.getItem('examSubject');
        
        if (!questions || questions.length === 0) {
            examContainer.innerHTML = '<p style="text-align: center; color: white; font-size: 1.2rem;">لم يتم العثور على أسئلة. يرجى العودة وإنشاء نموذج جديد.</p>';
            return;
        }

        let currentQuestionIndex = 0;
        let userAnswers = new Array(questions.length).fill(null);

        const questionText = document.getElementById('question-text');
        const optionsContainer = document.getElementById('options-container');
        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar');
        const subjectTitle = document.getElementById('subject-title');

        function displayQuestion(index) {
            const q = questions[index];
            questionText.textContent = `${index + 1}. ${q.question}`;
            optionsContainer.innerHTML = '';

            q.options.forEach((option, optionIndex) => {
                const optionElement = document.createElement('div');
                optionElement.className = 'option';
                optionElement.textContent = option;
                optionElement.dataset.index = optionIndex;

                if (userAnswers[index] === option) {
                    optionElement.classList.add('selected');
                }

                optionElement.addEventListener('click', () => {
                    userAnswers[index] = option;
                    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
                    optionElement.classList.add('selected');
                });

                optionsContainer.appendChild(optionElement);
            });

            progressText.textContent = `${index + 1} / ${questions.length}`;
            progressBar.style.width = `${((index + 1) / questions.length) * 100}%`;
        }

        subjectTitle.textContent = `📚 نموذج مادة ${subject}`;
        displayQuestion(currentQuestionIndex);

        document.getElementById('next-btn').addEventListener('click', () => {
            if (currentQuestionIndex < questions.length - 1) {
                currentQuestionIndex++;
                displayQuestion(currentQuestionIndex);
            }
        });

        document.getElementById('prev-btn').addEventListener('click', () => {
            if (currentQuestionIndex > 0) {
                currentQuestionIndex--;
                displayQuestion(currentQuestionIndex);
            }
        });

        document.getElementById('finish-btn').addEventListener('click', () => {
            localStorage.setItem('userAnswers', JSON.stringify(userAnswers));
            window.location.href = 'results.html';
        });
    }

    // --- منطق صفحة النتائج (results.html) ---
    const resultsContainer = document.querySelector('.results-container');
    if (resultsContainer) {
        const questions = JSON.parse(localStorage.getItem('examQuestions'));
        const userAnswers = JSON.parse(localStorage.getItem('userAnswers'));
        const subject = localStorage.getItem('examSubject');

        if (!questions || !userAnswers) {
            document.body.innerHTML = "<h1 style='text-align: center; color: white; margin-top: 50px;'>لا يمكن عرض النتائج. البيانات غير موجودة.</h1>";
        } else {
            let score = 0;
            const reviewContainer = document.getElementById('review-container');

            questions.forEach((q, index) => {
                const userAnswer = userAnswers[index];
                const correctAnswer = q.correct_answer;
                const isCorrect = userAnswer === correctAnswer;

                if (isCorrect) {
                    score++;
                }

                const questionElement = document.createElement('div');
                questionElement.className = `reviewed-question ${isCorrect ? 'correct' : 'incorrect'}`;
                
                let innerHTML = `<p class="question-text">${index + 1}. ${q.question}</p>`;
                
                if (isCorrect) {
                    innerHTML += `<p class="answer correct-answer">✅ إجابتك: ${userAnswer} (صحيحة)</p>`;
                } else {
                    innerHTML += `<p class="answer your-answer">❌ إجابتك: ${userAnswer || 'لم تجب'} (خاطئة)</p>`;
                    innerHTML += `<p class="answer correct-answer">✅ الإجابة الصحيحة: ${correctAnswer}</p>`;
                }
                
                questionElement.innerHTML = innerHTML;
                reviewContainer.appendChild(questionElement);
            });

            const scoreText = document.getElementById('score-text');
            const resultMessage = document.getElementById('result-message');
            const scorePercentage = document.getElementById('score-percentage');
            
            scoreText.textContent = `${score} / ${questions.length}`;

            const percentage = (score / questions.length) * 100;
            scorePercentage.textContent = `${percentage.toFixed(1)}%`;

            if (percentage >= 85) {
                resultMessage.textContent = "🎉 أداء مذهل!";
            } else if (percentage >= 70) {
                resultMessage.textContent = "👏 عمل جيد جداً!";
            } else if (percentage >= 50) {
                resultMessage.textContent = "📚 جيد، يمكنك التحسن أكثر.";
            } else {
                resultMessage.textContent = "💪 لا بأس، استمر في المراجعة والمحاولة!";
            }
        }
    }
});
