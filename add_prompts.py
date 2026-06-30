import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """                    <section class="card mock-exam-section">
                        <h2 class="section-title prompt-header-inline">
                            <span>DANH SÁCH ĐỀ</span>
                        </h2>
                        <div class="collapsible-content">
                            <div class="mock-exam-window">
                                <div class="mock-header">
                                    <div class="mock-timer">20:00</div>
                                    <div class="mock-status"></div>
                                </div>
                                <div class="mock-content" id="prompt-content-box">
                                    <div class="font-size-controls"><button class="font-btn highlight-toggle-btn" onclick="toggleHighlightMode()"><i class="fas fa-highlighter"></i> Bút nhớ: Tắt</button>
                                        <button class="font-btn" onclick="changePromptFontSize(-1)">-</button>
                                        <button class="font-btn default-btn" onclick="resetPromptFontSize()">Mặc định</button>
                                        <button class="font-btn" onclick="changePromptFontSize(1)">+</button>
                                    </div>
                                    <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên dành khoảng 20 phút cho phần thi này."><em>You should spend about <strong>20 minutes</strong> on this task.</em></span></p>
                                    <p><span class="interactive-phrase prompt-sentence" data-vi="Đọc tình huống dưới đây.">Read the situation below.</span></p>
                                    
                                    <div class="mock-email-quote">
                                        <p>
                                            <span class="interactive-phrase prompt-sentence" data-vi="Bạn là thành viên của một trung tâm thể thao địa phương.">You are a member of a local sports center.</span>
                                            <span class="interactive-phrase prompt-sentence" data-vi="Gần đây bạn đã sử dụng phòng thay đồ và không hài lòng với tình trạng của nó.">You have recently used the changing room and were not satisfied with its condition.</span>
                                            <span class="interactive-phrase prompt-sentence" data-vi="Hãy viết một email cho quản lý của trung tâm thể thao.">Write an email to the manager of the sports center.</span>
                                        </p>
                                        <p>
                                            <span class="interactive-phrase prompt-sentence" data-vi="Trong email của bạn, bạn nên:">In your email, you should:</span>
                                        </p>
                                        <ul>
                                            <li><span class="interactive-phrase prompt-sentence" data-vi="Mô tả những vấn đề bạn thấy trong phòng thay đồ">Describe the problems you found in the changing room</span></li>
                                            <li><span class="interactive-phrase prompt-sentence" data-vi="Giải thích tình huống đó khiến bạn cảm thấy thế nào">Explain how the situation made you feel</span></li>
                                            <li><span class="interactive-phrase prompt-sentence" data-vi="Đề xuất những gì nên làm để cải thiện cơ sở vật chất">Suggest what should be done to improve the facility</span></li>
                                        </ul>
                                    </div>

                                    <p><span class="interactive-phrase prompt-sentence" data-vi="Viết một email cho quản lý trung tâm thể thao trả lời các yêu cầu.">Write an email to the manager of the sports center responding to the requirements.</span></p>
                                    <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên viết ít nhất 120 từ. Không bao gồm tên hoặc địa chỉ của bạn."><em>You should write at least 120 words. Do not include your name or address.</em></span></p>
                                </div>
                            </div>
                        </div>
                    </section>"""

new_block = """                    <section class="card mock-exam-section">
                        <h2 class="section-title prompt-header-inline">
                            <span>DANH SÁCH ĐỀ</span>
                            <select class="prompt-dropdown" onchange="switchPrompt(this)">
                                <option value="sports-center">Phòng thay đồ TT Thể thao</option>
                                <option value="kitchen-equipment">Thiết bị nhà bếp hỏng</option>
                                <option value="shopee-order">Đơn hàng Shopee</option>
                                <option value="restaurant-dinner">Nhà hàng phục vụ kém</option>
                            </select>
                        </h2>
                        <div class="collapsible-content">
                            <div class="prompt-tabs-container">

                                <!-- ĐỀ SỐ 1: Sports Center -->
                                <div class="prompt-content active" id="sports-center">
                                    <div class="mock-exam-window">
                                        <div class="mock-header">
                                            <div class="mock-timer">20:00</div>
                                            <div class="mock-status"></div>
                                        </div>
                                        <div class="mock-content">
                                            <div class="font-size-controls"><button class="font-btn highlight-toggle-btn" onclick="toggleHighlightMode()"><i class="fas fa-highlighter"></i> Bút nhớ: Tắt</button>
                                                <button class="font-btn" onclick="changePromptFontSize(-1)">-</button>
                                                <button class="font-btn default-btn" onclick="resetPromptFontSize()">Mặc định</button>
                                                <button class="font-btn" onclick="changePromptFontSize(1)">+</button>
                                            </div>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên dành khoảng 20 phút cho phần thi này."><em>You should spend about <strong>20 minutes</strong> on this task.</em></span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Đọc tình huống dưới đây.">Read the situation below.</span></p>
                                            
                                            <div class="mock-email-quote">
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn là thành viên của một trung tâm thể thao địa phương.">You are a member of a local sports center.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Gần đây bạn đã sử dụng phòng thay đồ và không hài lòng với tình trạng của nó.">You have recently used the changing room and were not satisfied with its condition.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Hãy viết một email cho quản lý của trung tâm thể thao.">Write an email to the manager of the sports center.</span>
                                                </p>
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Trong email của bạn, bạn nên:">In your email, you should:</span>
                                                </p>
                                                <ul>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Mô tả những vấn đề bạn thấy trong phòng thay đồ">Describe the problems you found in the changing room</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Giải thích tình huống đó khiến bạn cảm thấy thế nào">Explain how the situation made you feel</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Đề xuất những gì nên làm để cải thiện cơ sở vật chất">Suggest what should be done to improve the facility</span></li>
                                                </ul>
                                            </div>

                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Viết một email cho quản lý trung tâm thể thao trả lời các yêu cầu.">Write an email to the manager of the sports center responding to the requirements.</span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên viết ít nhất 120 từ. Không bao gồm tên hoặc địa chỉ của bạn."><em>You should write at least 120 words. Do not include your name or address.</em></span></p>
                                        </div>
                                    </div>
                                </div>

                                <!-- ĐỀ SỐ 2: Kitchen Equipment -->
                                <div class="prompt-content" id="kitchen-equipment">
                                    <div class="mock-exam-window">
                                        <div class="mock-header">
                                            <div class="mock-timer">20:00</div>
                                            <div class="mock-status"></div>
                                        </div>
                                        <div class="mock-content">
                                            <div class="font-size-controls"><button class="font-btn highlight-toggle-btn" onclick="toggleHighlightMode()"><i class="fas fa-highlighter"></i> Bút nhớ: Tắt</button>
                                                <button class="font-btn" onclick="changePromptFontSize(-1)">-</button>
                                                <button class="font-btn default-btn" onclick="resetPromptFontSize()">Mặc định</button>
                                                <button class="font-btn" onclick="changePromptFontSize(1)">+</button>
                                            </div>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên dành khoảng 20 phút cho phần thi này."><em>You should spend about <strong>20 minutes</strong> on this task.</em></span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Đọc tình huống dưới đây.">Read the situation below.</span></p>
                                            
                                            <div class="mock-email-quote">
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Gần đây bạn đã mua một thiết bị cho nhà bếp, nhưng nó không hoạt động.">You recently bought a piece of equipment for your kitchen, but it did not work.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn đã gọi điện cho cửa hàng, nhưng không có biện pháp nào được thực hiện.">You phoned the shop, but no action was taken.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Hãy viết một lá thư cho quản lý cửa hàng.">Write a letter to the shop manager.</span>
                                                </p>
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Trong lá thư của bạn:">In your letter:</span>
                                                </p>
                                                <ul>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Mô tả vấn đề với thiết bị.">Describe the problem with the equipment.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Giải thích những gì đã xảy ra khi bạn gọi điện cho cửa hàng.">Explain what happened when you phoned the shop.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Cho biết bạn muốn quản lý làm gì.">Say what you would like the manager to do.</span></li>
                                                </ul>
                                            </div>

                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Viết một lá thư cho quản lý cửa hàng trả lời các yêu cầu.">Write a letter to the shop manager responding to the requirements.</span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên viết ít nhất 120 từ. Không bao gồm tên hoặc địa chỉ của bạn."><em>You should write at least 120 words. Do not include your name or address.</em></span></p>
                                        </div>
                                    </div>
                                </div>

                                <!-- ĐỀ SỐ 3: Shopee Order -->
                                <div class="prompt-content" id="shopee-order">
                                    <div class="mock-exam-window">
                                        <div class="mock-header">
                                            <div class="mock-timer">20:00</div>
                                            <div class="mock-status"></div>
                                        </div>
                                        <div class="mock-content">
                                            <div class="font-size-controls"><button class="font-btn highlight-toggle-btn" onclick="toggleHighlightMode()"><i class="fas fa-highlighter"></i> Bút nhớ: Tắt</button>
                                                <button class="font-btn" onclick="changePromptFontSize(-1)">-</button>
                                                <button class="font-btn default-btn" onclick="resetPromptFontSize()">Mặc định</button>
                                                <button class="font-btn" onclick="changePromptFontSize(1)">+</button>
                                            </div>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên dành khoảng 20 phút cho phần thi này."><em>You should spend about <strong>20 minutes</strong> on this task.</em></span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Đọc tình huống dưới đây.">Read the situation below.</span></p>
                                            
                                            <div class="mock-email-quote">
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn vừa đặt một món hàng trên Shopee nhưng bạn không hài lòng với sản phẩm.">You have just ordered an item on Shopee but you are not satisfied with the product.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Hãy viết một lá thư cho công ty.">Write a letter to the company.</span>
                                                </p>
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Lá thư của bạn bao gồm:">Your letter includes:</span>
                                                </p>
                                                <ul>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Mô tả những gì bạn đã mua.">Describe what you purchased.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Giải thích lý do tại sao bạn không hài lòng với sản phẩm.">Explain why you are not satisfied with the product.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Cho họ biết bạn muốn làm gì trong trường hợp này.">Tell them what you want to do in this case.</span></li>
                                                </ul>
                                            </div>

                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Viết một lá thư cho công ty trả lời các yêu cầu.">Write a letter to the company responding to the requirements.</span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên viết ít nhất 120 từ. Không bao gồm tên hoặc địa chỉ của bạn."><em>You should write at least 120 words. Do not include your name or address.</em></span></p>
                                        </div>
                                    </div>
                                </div>

                                <!-- ĐỀ SỐ 4: Restaurant Dinner -->
                                <div class="prompt-content" id="restaurant-dinner">
                                    <div class="mock-exam-window">
                                        <div class="mock-header">
                                            <div class="mock-timer">20:00</div>
                                            <div class="mock-status"></div>
                                        </div>
                                        <div class="mock-content">
                                            <div class="font-size-controls"><button class="font-btn highlight-toggle-btn" onclick="toggleHighlightMode()"><i class="fas fa-highlighter"></i> Bút nhớ: Tắt</button>
                                                <button class="font-btn" onclick="changePromptFontSize(-1)">-</button>
                                                <button class="font-btn default-btn" onclick="resetPromptFontSize()">Mặc định</button>
                                                <button class="font-btn" onclick="changePromptFontSize(1)">+</button>
                                            </div>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên dành khoảng 20 phút cho phần thi này."><em>You should spend about <strong>20 minutes</strong> on this task.</em></span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Đọc tình huống dưới đây.">Read the situation below.</span></p>
                                            
                                            <div class="mock-email-quote">
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn và vài người bạn đã ăn tối tại một nhà hàng vài tối trước.">You and some friends had dinner in a restaurant a few nights ago.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn đã thất vọng về bữa ăn vì dịch vụ tại nhà hàng rất tệ và đồ ăn thì không ngon.">You were disappointed with the meal because the service at the restaurant was terrible and the food was bad.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Bạn và hai người bạn đã bị đau dạ dày dữ dội vào ngày hôm sau.">You and two friends had severe stomach aches the following day.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Thức ăn cũng đắt đỏ quá mức.">The food was also overpriced.</span>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Hãy viết một lá thư cho quản lý của nhà hàng.">Write a letter to the manager of the restaurant.</span>
                                                </p>
                                                <p>
                                                    <span class="interactive-phrase prompt-sentence" data-vi="Trong lá thư của bạn:">In your letter:</span>
                                                </p>
                                                <ul>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Giải thích lý do tại sao bạn ở nhà hàng.">Explain why you were at the restaurant.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Mô tả các vấn đề gặp phải.">Describe the problems.</span></li>
                                                    <li><span class="interactive-phrase prompt-sentence" data-vi="Viết về hành động bạn muốn quản lý thực hiện.">Write about the action you want the manager to take.</span></li>
                                                </ul>
                                            </div>

                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Viết một lá thư cho quản lý nhà hàng trả lời các yêu cầu.">Write a letter to the manager of the restaurant responding to the requirements.</span></p>
                                            <p><span class="interactive-phrase prompt-sentence" data-vi="Bạn nên viết ít nhất 120 từ. Không bao gồm tên hoặc địa chỉ của bạn."><em>You should write at least 120 words. Do not include your name or address.</em></span></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>"""

content = content.replace(old_block, new_block)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
