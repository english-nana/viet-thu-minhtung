import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new content for "Thư phàn nàn"
new_content = """                <div class="tab-content" id="phan-nan">

                    <!-- ==================== PHẦN 1: NỘI DUNG CHÍNH ==================== -->
                    <section class="card structures-section">
                        <h2 class="section-title" style="color: #0f172a;">CÁCH VIẾT THƯ PHÀN NÀN</h2>
                        <div class="structure-grid">
                            <div class="structure-box" style="padding: 1.25rem; line-height: 1.5;">
                                
                                <h3 style="margin-bottom: 10px; color: var(--primary-color);">Đa số các đề thư phàn nàn thường sẽ có 02 trường hợp</h3>
                                <div style="color: #475569; padding-left: 10px; margin-top: 5px; margin-bottom: 20px; line-height: 1.5;">
                                    + Phàn nàn về một trải nghiệm tồi tệ<br>
                                    + Phàn nàn về một món đồ
                                </div>
                                
                                <h3 style="margin-bottom: 10px; color: var(--primary-color);">Các bước phàn nàn</h3>
                                <ul class="structure-list" style="margin-top: 5px; line-height: 1.5;">
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px dashed #e2e8f0;">
                                        <div style="font-weight: bold; color: #0f172a; margin-bottom: 3px;">01. Miêu tả tình huống</div>
                                        <div style="color: #475569; padding-left: 10px;">
                                            + Sử dụng dịch vụ khi nào, ở đâu<br>
                                            + Mua sản phẩm gì, mua khi nào
                                        </div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px dashed #e2e8f0;">
                                        <div style="font-weight: bold; color: #0f172a; margin-bottom: 3px;">02. Nói mình cảm thấy thất vọng hoặc không hài lòng với sản phẩm hoặc yếu tố gì đó</div>
                                        <div style="color: #475569; padding-left: 10px;">
                                            + Miêu tả cụ thể vấn đề<br>
                                            + Vấn đề đó gây ra khó khăn hay sự bất tiện gì
                                        </div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px dashed #e2e8f0;">
                                        <div style="font-weight: bold; color: #0f172a;">03. Nói mình cảm thấy thế nào</div>
                                    </li>
                                    <li style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                                        <div style="font-weight: bold; color: #0f172a;">04. Nêu đề xuất cải thiện hoặc yêu cầu bù đắp</div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <!-- ==================== PHẦN 2: TỪ VỰNG & CẤU TRÚC ==================== -->
                    <section class="card structures-section">
                        <h2 class="section-title" style="color: #0f172a;">TỪ VỰNG & CẤU TRÚC GỢI Ý</h2>
                        <div class="structure-grid">
                            
                            <!-- Thất vọng / Không hài lòng -->
                            <div class="structure-box" style="padding: 1.25rem;">
                                <h3 style="margin-bottom: 0.75rem;">Nói mình cảm thấy thất vọng hoặc không hài lòng với sản phẩm hoặc yếu tố gì đó</h3>
                                <ul class="structure-list">
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">I was very disappointed with + <span class="text-red">N</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi đã rất thất vọng với cả dịch vụ và thức ăn."><span style="color: #0f172a;">I was very disappointed with</span> <span class="text-red">both the service and the food.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                                        <div class="structure-formula">I was not satisfied with + <span class="text-red">N</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi không hài lòng với sản phẩm."><span style="color: #0f172a;">I was not satisfied with</span> <span class="text-red">the product.</span></div>
                                    </li>
                                </ul>
                            </div>

                            <!-- Miêu tả cụ thể vấn đề -->
                            <div class="structure-box" style="padding: 1.25rem;">
                                <h3 style="margin-bottom: 0.75rem;">Miêu tả cụ thể vấn đề</h3>
                                <ul class="structure-list">
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> + tobe + wet, dirty, slippery</div>
                                        <div class="interactive-phrase" data-vi="Sàn nhà thì ướt và trơn trượt."><span class="text-red">The floor</span> <span style="color: #0f172a;">was wet and slippery.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">It was quite difficult for <span class="text-blue">ai đó</span> to + <span class="text-green">Vo</span></div>
                                        <div class="interactive-phrase" data-vi="Khá khó khăn cho các thành viên để đi lại an toàn."><span style="color: #0f172a;">It was quite difficult for</span> <span class="text-blue">members</span> <span style="color: #0f172a;">to</span> <span class="text-green">walk safely.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> + tobe + broken</div>
                                        <div class="interactive-phrase" data-vi="Một số cái ghế đã bị hỏng."><span class="text-red">Some chairs</span> <span style="color: #0f172a;">were broken.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">There was a bad, a strong and unpleasant smell in <span class="text-blue">____</span></div>
                                        <div class="interactive-phrase" data-vi="Có một mùi khó chịu trong phòng."><span style="color: #0f172a;">There was a bad smell in</span> <span class="text-blue">the room.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(người)</sub></span> + tobe + not friendly</div>
                                        <div class="interactive-phrase" data-vi="Một số nhân viên không thân thiện."><span class="text-red">Some staff members</span> <span style="color: #0f172a;">were not friendly.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(người)</sub></span> had to wait for a long time</div>
                                        <div class="interactive-phrase" data-vi="Bạn bè tôi và tôi đã phải chờ một thời gian dài."><span class="text-red">My friends and I</span> <span style="color: #0f172a;">had to wait for a long time.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> did not work properly</div>
                                        <div class="interactive-phrase" data-vi="Nó không hoạt động đúng cách."><span class="text-red">It</span> <span style="color: #0f172a;">did not work properly.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> made a strange noise</div>
                                        <div class="interactive-phrase" data-vi="Cái máy phát ra tiếng ồn lạ."><span class="text-red">The machine</span> <span style="color: #0f172a;">made a strange noise.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> stopped <span class="text-green">Ving</span> completely</div>
                                        <div class="interactive-phrase" data-vi="Nó đã ngừng hoạt động hoàn toàn."><span class="text-red">It</span> <span style="color: #0f172a;">stopped</span> <span class="text-green">working</span> <span style="color: #0f172a;">completely.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                                        <div class="structure-formula"><span class="text-red">S<sub>(sự vật)</sub></span> looked different from the picture on the website</div>
                                        <div class="interactive-phrase" data-vi="Sản phẩm trông khác với hình ảnh trên trang web."><span class="text-red">The product</span> <span style="color: #0f172a;">looked different from the picture on the website.</span></div>
                                    </li>
                                </ul>
                            </div>

                            <!-- Nói mình cảm thấy thế nào -->
                            <div class="structure-box" style="padding: 1.25rem;">
                                <h3 style="margin-bottom: 0.75rem;">Nói mình cảm thấy thế nào</h3>
                                <ul class="structure-list">
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">These problems made me feel + <span class="text-blue">adj</span></div>
                                        <div class="interactive-phrase" data-vi="Những vấn đề này làm tôi cảm thấy khó chịu và không vui."><span style="color: #0f172a;">These problems made me feel</span> <span class="text-blue">uncomfortable and unhappy.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">I usually enjoy + <span class="text-green">Ving</span>, but this experience made me disappointed</div>
                                        <div class="interactive-phrase" data-vi="Tôi thường thích đến nhà hàng của bạn, nhưng trải nghiệm này làm tôi thất vọng."><span style="color: #0f172a;">I usually enjoy</span> <span class="text-green">going to your restaurant</span><span style="color: #0f172a;">, but this experience made me disappointed.</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi thường mua sản phẩm từ cửa hàng của bạn, nhưng trải nghiệm này làm tôi thất vọng."><span style="color: #0f172a;">I usually enjoy</span> <span class="text-green">buying products from your shop</span><span style="color: #0f172a;">, but this experience made me disappointed.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                                        <div class="structure-formula">I expect higher quality from a/an <span class="text-red">địa điểm</span> with such a good reputation.</div>
                                        <div class="interactive-phrase" data-vi="Tôi mong đợi chất lượng cao hơn từ một trung tâm thể hình có danh tiếng tốt như vậy."><span style="color: #0f172a;">I expect higher quality from a</span> <span class="text-red">fitness center</span> <span style="color: #0f172a;">with such a good reputation.</span></div>
                                    </li>
                                </ul>
                            </div>

                            <!-- Nêu đề xuất cải thiện hoặc yêu cầu bù đắp -->
                            <div class="structure-box" style="padding: 1.25rem;">
                                <h3 style="margin-bottom: 0.75rem;">Nêu đề xuất cải thiện hoặc yêu cầu bù đắp</h3>
                                <ul class="structure-list">
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">I think you should + <span class="text-blue">Vo</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi nghĩ bạn nên yêu cầu nhân viên kiểm tra phòng thay đồ thường xuyên hơn."><span style="color: #0f172a;">I think you should</span> <span class="text-blue">ask the staff to check the changing room more often.</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi nghĩ bạn nên đào tạo nhân viên để phục vụ khách hàng tốt hơn."><span style="color: #0f172a;">I think you should</span> <span class="text-blue">train your staff to serve customers better.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">I suggest that + <span class="text-red">mệnh đề</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi đề xuất rằng phòng thay đồ nên được dọn dẹp thường xuyên."><span style="color: #0f172a;">I suggest that</span> <span class="text-red">the changing room should be cleaned regularly.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0.75rem; padding-bottom: 0.75rem;">
                                        <div class="structure-formula">I would like to + <span class="text-blue">Vo</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi muốn trả lại sản phẩm và được hoàn tiền đầy đủ."><span style="color: #0f172a;">I would like to</span> <span class="text-blue">return the product and get a full refund.</span></div>
                                    </li>
                                    <li style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                                        <div class="structure-formula">I would like you to + <span class="text-blue">Vo</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi muốn bạn gửi cho tôi một sản phẩm mới hoạt động tốt."><span style="color: #0f172a;">I would like you to</span> <span class="text-blue">send me a new product that works well.</span></div>
                                        <div class="interactive-phrase" data-vi="Tôi cũng muốn bạn hoàn tiền đầy đủ hoặc đưa ra mức bồi thường cho trải nghiệm tồi tệ này."><span style="color: #0f172a;">I would also like you to</span> <span class="text-blue">give us a full refund or offer some compensation for this bad experience.</span></div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <!-- ==================== PHẦN 3: ĐỀ BÀI VÀ BÀI MẪU ==================== -->
                    <section class="card mock-exam-section">
                        <h2 class="section-title prompt-header-inline" style="color: #0f172a;">
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
                                    <div class="sample-essay-section">
                                        <h3 class="sample-essay-title"><i class="fas fa-envelope-open-text"></i> Bài Mẫu Tham Khảo</h3>
                                        <div class="sample-essay-content">
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thưa Ông/Bà,">Dear Sir/Madam,</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng lá thư này đến được với bạn trong tình trạng sức khỏe tốt.">I hope this letter finds you well.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi là một thành viên thường xuyên tại trung tâm thể thao của bạn.">I am a regular member at your sports center.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi viết thư này để bày tỏ sự không hài lòng của mình với tình trạng của phòng thay đồ tại trung tâm của bạn.">I am writing to express my dissatisfaction with the condition of the changing room at your center.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã sử dụng nó vào thứ Hai tuần trước sau buổi tập của mình, nhưng tôi rất thất vọng với những gì tôi thấy.">I used it last Monday after my training session, but I was very disappointed with what I saw.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Đầu tiên, sàn nhà ướt và bẩn, vì vậy khá khó khăn cho các thành viên để đi lại an toàn.">Firstly, the floor was wet and dirty, so it was quite difficult for members to walk safely.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Hơn nữa, một số tủ để đồ đã bị hỏng, và tôi không thể tìm thấy một nơi an toàn để cất đồ dùng cá nhân của mình.">Moreover, some lockers were broken, and I could not find a safe place to put my personal items.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Ngoài ra, có một mùi khó chịu trong phòng, điều này làm mọi người cảm thấy khó chịu và chúng tôi không thể ở trong phòng quá lâu.">In addition, there was a bad smell in the room, which made everyone feel annoyed and we could not stay in the room for too long.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Những vấn đề này làm tôi cảm thấy không thoải mái và không vui.">These problems made me feel uncomfortable and unhappy.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi thường thích đến trung tâm thể thao của bạn, nhưng trải nghiệm này làm tôi thất vọng.">I usually enjoy going to your sports center, but this experience made me disappointed.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi mong đợi chất lượng cao hơn từ một trung tâm thể hình có danh tiếng tốt như vậy.">I expect higher quality from a fitness center with such a good reputation.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi nghĩ bạn nên yêu cầu nhân viên kiểm tra phòng thay đồ thường xuyên hơn.">I think you should ask the staff to check the changing room more often.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Ngoài ra, các tủ để đồ bị hỏng nên được sửa chữa càng sớm càng tốt.">Also, the broken lockers should be repaired as soon as possible.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cuối cùng, tôi đề xuất rằng phòng thay đồ nên được dọn dẹp thường xuyên để đảm bảo rằng nó không có mùi khó chịu.">Finally, I suggest that the changing room should be cleaned regularly to make sure that it does not smell bad.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cảm ơn bạn đã dành thời gian đọc email của tôi.">Thank you for taking the time to read my email.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng bạn sẽ xem xét vấn đề này sớm.">I hope you will look into the matter soon.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trân trọng,">Yours faithfully,</span>
                                            </p>
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
                                    <div class="sample-essay-section">
                                        <h3 class="sample-essay-title"><i class="fas fa-envelope-open-text"></i> Bài Mẫu Tham Khảo</h3>
                                        <div class="sample-essay-content">
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thưa Ông/Bà,">Dear Sir/Madam,</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng lá thư này đến được với bạn trong tình trạng sức khỏe tốt.">I hope this letter finds you well.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi là một khách hàng thường xuyên tại cửa hàng của bạn.">I am a regular customer at your shop.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi viết thư này để bày tỏ sự không hài lòng của mình với một thiết bị nhà bếp mà tôi đã mua từ cửa hàng của bạn vào tuần trước.">I am writing to express my dissatisfaction with a piece of kitchen equipment that I bought from your store last week.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Đó là một nồi chiên không dầu.">It was an air fryer.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã không hài lòng với sản phẩm.">I was not satisfied with the product.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Khi tôi cố gắng sử dụng nó ở nhà, nó không hoạt động đúng cách.">When I tried to use it at home, it did not work properly.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cái máy phát ra tiếng ồn lạ, và sau vài giây, nó đã ngừng hoạt động hoàn toàn.">The machine made a strange noise, and after a few seconds, it stopped completely.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã gọi cho cửa hàng của bạn vào ngày hôm sau và giải thích vấn đề với một trong những nhân viên của bạn.">I called your shop the next day and explained the problem to one of your staff.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Anh ấy nói với tôi rằng ai đó sẽ liên lạc với tôi sớm, nhưng không ai gọi lại cho tôi.">He told me that someone would contact me soon, but no one called me back.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã chờ đợi trong vài ngày, nhưng không có biện pháp nào được thực hiện.">I waited for several days, but no action was taken.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trải nghiệm này làm tôi cảm thấy bực mình và không vui.">This experience made me feel upset and unhappy.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi thường thích mua sắm tại cửa hàng của bạn, nhưng trải nghiệm này làm tôi thất vọng.">I usually enjoy shopping at your store, but this experience made me disappointed.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi mong đợi chất lượng cao hơn từ một cửa hàng có danh tiếng tốt như vậy.">I expect higher quality from a shop with such a good reputation.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi muốn trả lại sản phẩm và được hoàn tiền đầy đủ.">I would like to return the product and get a full refund.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Ngoài ra, tôi nghĩ bạn nên đào tạo nhân viên của mình để xử lý khiếu nại của khách hàng nhanh hơn trong tương lai.">Also, I think you should train your staff to handle customer complaints more quickly in the future.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cảm ơn bạn đã dành thời gian đọc email của tôi.">Thank you for taking the time to read my email.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng bạn sẽ xem xét vấn đề này sớm.">I hope you will look into the matter soon.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trân trọng,">Yours faithfully,</span>
                                            </p>
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
                                    <div class="sample-essay-section">
                                        <h3 class="sample-essay-title"><i class="fas fa-envelope-open-text"></i> Bài Mẫu Tham Khảo</h3>
                                        <div class="sample-essay-content">
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thưa Ông/Bà,">Dear Sir/Madam,</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng lá thư này đến được với bạn trong tình trạng sức khỏe tốt.">I hope this letter finds you well.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi là một khách hàng thường xuyên tại cửa hàng của bạn.">I am a regular customer at your shop.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi viết thư này để bày tỏ sự không hài lòng của mình với một sản phẩm tôi vừa đặt trên Shopee.">I am writing to express my dissatisfaction with a product I recently ordered on Shopee.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã không hài lòng với sản phẩm.">I was not satisfied with the product.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Đầu tiên, con chuột trông khác với hình ảnh trên trang web.">Firstly, the mouse looked different from the picture on the website.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Hơn nữa, nó không hoạt động đúng cách khi tôi kết nối nó với máy tính xách tay của mình.">Moreover, it did not work properly when I connected it to my laptop.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Đôi khi, nó ngừng di chuyển, và các nút rất khó nhấn.">Sometimes, it stopped moving, and the buttons were difficult to press.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trải nghiệm này làm tôi cảm thấy bực mình và không vui.">This experience made me feel upset and unhappy.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi thường mua sản phẩm từ cửa hàng của bạn, nhưng trải nghiệm này làm tôi thất vọng.">I usually buy products from your shop, but this experience made me disappointed.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi mong đợi chất lượng cao hơn từ một cửa hàng có danh tiếng tốt như vậy.">I expect higher quality from a shop with such a good reputation.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi muốn trả lại sản phẩm và được hoàn tiền đầy đủ.">I would like to return the product and get a full refund.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Nếu điều này không thể, tôi muốn bạn gửi cho tôi một sản phẩm mới hoạt động tốt.">If this is not possible, I would like you to send me a new product that works well.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cảm ơn bạn đã dành thời gian đọc email của tôi.">Thank you for taking the time to read my email.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng bạn sẽ xem xét vấn đề này sớm.">I hope you will look into the matter soon.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trân trọng,">Yours faithfully,</span>
                                            </p>
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
                                    <div class="sample-essay-section">
                                        <h3 class="sample-essay-title"><i class="fas fa-envelope-open-text"></i> Bài Mẫu Tham Khảo</h3>
                                        <div class="sample-essay-content">
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thưa Ông/Bà,">Dear Sir/Madam,</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng lá thư này đến được với bạn trong tình trạng sức khỏe tốt.">I hope this letter finds you well.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi là một khách hàng thường xuyên tại nhà hàng của bạn.">I am a regular customer at your restaurant.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi viết thư này để bày tỏ sự không hài lòng của mình với bữa tối của chúng tôi vài tối trước.">I am writing to express my dissatisfaction with our dinner a few nights ago.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi đã đến đó cùng một vài người bạn để tổ chức sinh nhật của mình, và chúng tôi mong đợi sẽ có một buổi tối tuyệt vời cùng nhau.">I went there with some friends to celebrate my birthday, and we expected to have a great night together.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thật không may, nó hóa ra lại là một trải nghiệm tồi tệ.">Unfortunately, it turned out to be a terrible experience.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Chúng tôi đã rất thất vọng với cả dịch vụ và thức ăn.">We were very disappointed with both the service and the food.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Đầu tiên, các bồi bàn không thân thiện, và chúng tôi đã phải chờ một thời gian dài trước khi thức ăn được phục vụ.">Firstly, the waiters were not friendly, and we had to wait a long time before our food was served.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thứ hai, thức ăn đã nguội và không có vị tươi.">Secondly, the food was cold and did not taste fresh.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Thực ra, hai người bạn của tôi và tôi đã bị đau dạ dày dữ dội vào ngày hôm sau.">Actually, two of my friends and I had severe stomach aches the next day.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Vì điều này, chúng tôi không thể đi làm và phải nghỉ ngơi ở nhà.">Because of this, we could not go to work and had to rest at home.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Giá cả cũng rất cao.">The prices were also very high.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trải nghiệm này làm chúng tôi cảm thấy bực mình và không vui.">This experience made us feel upset and unhappy.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi thường thích đến nhà hàng của bạn, nhưng trải nghiệm này làm tôi thất vọng.">I usually enjoy going to your restaurant, but this experience made me disappointed.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi mong đợi chất lượng cao hơn từ một nhà hàng có danh tiếng tốt như vậy.">I expect higher quality from a restaurant with such a good reputation.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi nghĩ bạn nên kiểm tra thức ăn cẩn thận và đào tạo nhân viên của mình để phục vụ khách hàng tốt hơn.">I think you should check the food carefully and train your staff to serve customers better.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi cũng muốn bạn hoàn tiền cho chúng tôi hoặc đưa ra mức bồi thường cho trải nghiệm tồi tệ này.">I would also like you to give us a refund or offer some compensation for this bad experience.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Cảm ơn bạn đã dành thời gian đọc email của tôi.">Thank you for taking the time to read my email.</span>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Tôi hy vọng bạn sẽ xem xét vấn đề này sớm.">I hope you will look into the matter soon.</span>
                                            </p>
                                            <p>
                                                <span class="interactive-phrase prompt-sentence" data-vi="Trân trọng,">Yours faithfully,</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>"""

# Replace content
# The old content starts with <div class="tab-content" id="phan-nan">
# and ends right before <!-- ==================== TAB 6: THƯ CHO ĐÁNH GIÁ ==================== -->
pattern = re.compile(r'<div class="tab-content" id="phan-nan">.*?(?=<!-- ==================== TAB 6)', re.DOTALL)
content = pattern.sub(new_content + '\n\n                ', content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
