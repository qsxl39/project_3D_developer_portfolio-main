

// import { BrowserRouter } from "react-router-dom";

// import {About,Contact,Experience,Feedbacks,Hero,Navbar,StarsCanvas,Tech,Works} from "./components";



// const App = () => {
//   return (
//     <BrowserRouter>
//       <div className="relative z-0 bg-primary">
//         <Navbar />
//         <Hero />
//         <About />
//         <Tech />
//         <Experience />
//         <Works />
//         <Feedbacks />
//         <Contact />
//         <StarsCanvas/>
//         {/* Footer */}
//         <div className="absolute bottom-10 w-full flex justify-center items-center">
//           <p className="text-secondary text-[14px]">© 2023 Adrian. All rights reserved.</p>
//         </div>
//       </div>
//     </BrowserRouter>
//   );
// }

// export default App;

import { BrowserRouter } from "react-router-dom";

import { About, Contact, Experience, Feedbacks, Hero, Navbar, Tech, Works, StarsCanvas } from "./components";

const App = () => {
  return (
    <BrowserRouter>
      <div className='relative z-0 bg-primary'>
        <div className='bg-hero-pattern bg-cover bg-no-repeat bg-center'>
          <Navbar />
          <Hero />
        </div>
        <About />
        <Experience />
        <Tech />
        {/* <Works /> */}
        {/* <Feedbacks /> */}
        <div className='relative z-0'>
          <Contact />
          <StarsCanvas />
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
