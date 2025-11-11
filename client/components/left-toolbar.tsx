import { Archive, Calendar, CheckSquare, Settings } from "lucide-react";

export function LeftToolbar() {
  return (
    <div className="w-12 h-full bg-Skriuw-darker border-r border-Skriuw-border flex flex-col justify-between items-center py-12 px-1.5">
      <div className="flex flex-col items-center gap-2">
        <button className="w-7 h-7 flex items-center justify-center rounded-md bg-Skriuw-border hover:bg-Skriuw-border/80 transition-colors">
          <Archive className="w-[18px] h-[18px] text-Skriuw-text" />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Calendar className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <CheckSquare className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Archive className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <svg className="w-4 h-4 text-Skriuw-icon" viewBox="0 0 16 16" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M6.88668 1.01309C6.60303 0.759828 6.27128 0.783705 6.06848 0.828004C5.89484 0.86594 5.69424 0.945788 5.51207 1.0183L5.47756 1.03203C5.30168 1.10193 5.12913 1.17822 4.9602 1.26058C4.518 1.47617 4.10064 1.73343 3.71343 2.02713C1.94444 3.36891 0.799988 5.47636 0.799988 7.84895C0.799988 11.9184 4.15968 15.2 8.28247 15.2C10.8213 15.2 13.0678 13.9568 14.4208 12.0537C14.5864 11.8209 14.7387 11.5779 14.8765 11.3261L14.8941 11.2941C14.9825 11.1328 15.0826 10.9501 15.1389 10.7863C15.2074 10.5873 15.2609 10.273 15.0529 9.97007C14.8344 9.65191 14.4973 9.60207 14.2973 9.59695C14.1178 9.59231 13.8996 9.62087 13.6962 9.64743L13.6595 9.65223C9.82447 10.1523 8.04671 9.09775 7.25399 7.7375C6.41258 6.29365 6.51475 4.25177 7.00405 2.48103L7.01402 2.445C7.07254 2.23348 7.13358 2.01288 7.1556 1.82972C7.1789 1.63588 7.1851 1.27956 6.88668 1.01309ZM5.49753 2.35727C5.59951 2.30755 5.70306 2.26048 5.8081 2.21614C5.30131 4.08626 5.11682 6.49897 6.19608 8.35095C7.32718 10.2919 9.68911 11.3802 13.7275 10.8742C13.6331 11.0367 13.5313 11.1947 13.4226 11.3477C12.2925 12.9373 10.4133 13.9793 8.28247 13.9793C4.81622 13.9793 2.02366 11.2251 2.02366 7.84895C2.02366 5.87853 2.97244 4.12264 4.45408 2.99881C4.77813 2.75302 5.12744 2.53771 5.49753 2.35727Z" fill="currentColor" />
          </svg>
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Settings className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
      </div>
    </div>
  );
}
